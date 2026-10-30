import '../l10n/customer_copy.dart';
import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart' as intl;
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../experience/customer_experience.dart';
import '../experience/customer_media.dart';
import '../experience/result_export.dart';
import 'customer_theme.dart';
import 'customer_skeleton.dart';
import 'customer_demo_catalog.dart';
import 'customer_generating_look.dart';
import 'customer_result_suggestions.dart';

Future<void> openCustomerStudio(
  BuildContext context,
  CustomerExperience experience,
  CustomerPhotoPicker picker, {
  Json? product,
  Json? demoProduct,
  String? demoModelId,
  bool uploadPerson = false,
}) async {
  final ready = await prepareCustomerStudio(
    context,
    experience,
    product: product,
    demoProduct: demoProduct,
    demoModelId: demoModelId,
  );
  if (!ready || !context.mounted) return;
  if (uploadPerson) {
    final source = await showModalBottomSheet<CustomerPhotoSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const CustomerText('Choose from photos'),
              onTap: () => Navigator.pop(context, CustomerPhotoSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const CustomerText('Take a photo'),
              onTap: () => Navigator.pop(context, CustomerPhotoSource.camera),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
    if (source == null || !context.mounted) return;
    final sessionId = experience.session?['id'];
    final photo = await picker.pick(source);
    if (photo == null ||
        !context.mounted ||
        sessionId == null ||
        experience.session?['id'] != sessionId) {
      return;
    }
    await experience.upload('PERSON', photo.bytes, photo.mime);
  }
  if (!context.mounted) return;
  await Navigator.push<void>(
    context,
    MaterialPageRoute(
      builder: (_) => CustomerStudio(experience: experience, picker: picker),
    ),
  );
}

Future<bool> prepareCustomerStudio(
  BuildContext context,
  CustomerExperience experience, {
  Json? product,
  Json? demoProduct,
  String? demoModelId,
}) async {
  if (!experience.generating && !experience.hasUncertainRequest) {
    if (!experience.available) {
      await customerInfo(
        context,
        'Your fitting room',
        'Try-On is temporarily unavailable. Refresh Home and try again shortly.',
      );
      return false;
    }
    if (!experience.storeMode && (experience.remaining ?? 0) < 1) {
      await Navigator.push<void>(
        context,
        MaterialPageRoute(
          builder: (_) => CustomerPlansScreen(experience: experience),
        ),
      );
      return false;
    }
    final accepted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              CustomerText(
                'Your photos. Your choice.',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 16),
              CustomerText(experience.summary!['consentStatement'] as String),
              if (experience.storeMode) ...[
                const SizedBox(height: 16),
                CustomerNotice(
                  experience.summary!['storeConsentStatement'] as String,
                ),
              ],
              const SizedBox(height: 16),
              const CustomerText(
                'Choose photos you own or have permission to use. Virtual Try-On is a visual preview; fit and detail can vary.',
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.pop(context, true),
                  child: const CustomerText('Agree & continue'),
                ),
              ),
              Center(
                child: TextButton(
                  onPressed: () => Navigator.pop(context, false),
                  child: const CustomerText('Not now'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (accepted != true || !context.mounted) return false;
    await experience.begin(
      storeProduct: product,
      selectedDemoProduct: demoProduct,
      selectedDemoModelId: demoModelId,
    );
  }
  return context.mounted && experience.session != null;
}

class CustomerPlansScreen extends StatefulWidget {
  final CustomerExperience experience;
  const CustomerPlansScreen({super.key, required this.experience});

  @override
  State<CustomerPlansScreen> createState() => _CustomerPlansScreenState();
}

class _CustomerPlansScreenState extends State<CustomerPlansScreen>
    with WidgetsBindingObserver {
  static const upiChannel = MethodChannel('com.selfx.customer/upi');
  late Future<Json> mobilePlans;
  Json? purchase;
  bool purchasing = false;
  bool checking = false;
  bool confirmingLeave = false;
  bool cancellingPayment = false;
  String? paymentError;
  String selectedBillingPeriod = 'MONTHLY';
  String? selectedPlanId;
  final TextEditingController customCredits = TextEditingController(text: '1');
  Timer? paymentClock;
  final ValueNotifier<DateTime> paymentNow = ValueNotifier(DateTime.now());
  String? expiredCheckedId;

  DateTime? get paymentExpiry =>
      DateTime.tryParse(purchase?['expiresAt'] as String? ?? '');

  DateTime? get retryAvailableAt =>
      DateTime.tryParse(purchase?['retryAvailableAt'] as String? ?? '') ??
      paymentExpiry?.add(const Duration(minutes: 5));

  bool get paymentOpen =>
      purchase != null &&
      !const ['PAID', 'FAILED', 'CANCELLED'].contains(purchase?['status']);

  bool get retryReady =>
      paymentOpen &&
      purchase?['status'] != 'CANCELLING' &&
      retryAvailableAt != null &&
      !retryAvailableAt!.isAfter(DateTime.now());

  String remainingTime(DateTime deadline) {
    final seconds = deadline.difference(DateTime.now()).inSeconds + 1;
    final safe = seconds < 0 ? 0 : seconds;
    return '${(safe ~/ 60).toString().padLeft(2, '0')}:${(safe % 60).toString().padLeft(2, '0')}';
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    mobilePlans = widget.experience.auth.authorized('/mobile-plans');
    unawaited(loadPending());
    paymentClock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || !paymentOpen) return;
      paymentNow.value = DateTime.now();
      final id = purchase?['id'] as String?;
      if (id != null &&
          expiredCheckedId != id &&
          paymentExpiry != null &&
          !paymentExpiry!.isAfter(DateTime.now())) {
        expiredCheckedId = id;
        unawaited(checkPayment());
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    paymentClock?.cancel();
    paymentNow.dispose();
    customCredits.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && purchase != null) {
      unawaited(checkPayment());
    }
  }

  Future<void> buy({String? planId, int? credits}) async {
    if (purchasing) return;
    setState(() {
      purchasing = true;
      paymentError = null;
    });
    try {
      if (paymentOpen) {
        final current = await checkPayment();
        if (!mounted || current == null) return;
        if (current['status'] != 'FAILED' &&
            current['status'] != 'PAID' &&
            !retryReady) {
          setState(
            () => paymentError =
                'This payment is still being checked. You can retry when the timer ends.',
          );
          return;
        }
      }
      final next = await widget.experience.auth.authorized(
        '/mobile-payments',
        method: 'POST',
        body: {
          'planId': ?planId,
          'credits': ?credits,
          'requestId': const Uuid().v4(),
        },
      );
      if (!mounted) return;
      setState(() => purchase = next);
      await showPaymentOptions();
    } catch (error) {
      if (mounted) setState(() => paymentError = error.toString());
    } finally {
      if (mounted) setState(() => purchasing = false);
    }
  }

  Future<void> showPaymentOptions() async {
    if (purchase?['status'] == 'CANCELLING') {
      if (mounted) {
        setState(
          () => paymentError =
              'PhonePe is confirming this payment. Check its status shortly.',
        );
      }
      return;
    }
    final id = purchase?['id'] as String?;
    final checkout = purchase?['checkoutUrl'] as String?;
    final expiresAt = DateTime.tryParse(
      purchase?['expiresAt'] as String? ?? '',
    );
    if (expiresAt != null && !expiresAt.isAfter(DateTime.now())) {
      if (mounted) {
        setState(
          () => paymentError =
              'This payment has expired. Check its status, then start a new purchase.',
        );
      }
      return;
    }
    if (id == null || checkout == null) {
      if (mounted) {
        setState(
          () => paymentError =
              'The payment link is being prepared. Check this payment shortly.',
        );
      }
      return;
    }
    final isUpi = Uri.tryParse(checkout)?.scheme == 'upi';
    Uint8List? qr;
    try {
      qr = await widget.experience.auth.authorizedDownload(
        '/mobile-payments/$id/qr',
      );
    } catch (_) {
      // App payment remains available if QR loading fails.
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (didPop || cancellingPayment) return;
          if (paymentOpen) {
            unawaited(confirmLeavePayment(dialogContext));
          } else {
            closePaymentDialog(dialogContext);
          }
        },
        child: ValueListenableBuilder<DateTime>(
          valueListenable: paymentNow,
          builder: (context, _, child) => AlertDialog(
            title: CustomerText(isUpi ? 'UPI payment' : 'Complete payment'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (expiresAt != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: CustomerColors.orange.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: CustomerText(
                        'Time left  ${remainingTime(expiresAt)}',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                  const SizedBox(height: 10),
                  if (purchase?['amountMinor'] is num)
                    CustomerText(
                      'Total: ${intl.NumberFormat.simpleCurrency(name: purchase?['currency'] as String? ?? 'INR').format((purchase!['amountMinor'] as num) / 100)}',
                    ),
                  const SizedBox(height: 16),
                  if (purchase?['status'] == 'PAID')
                    const CustomerText(
                      'Payment confirmed. Your credits are ready.',
                      textAlign: TextAlign.center,
                    )
                  else if (purchase?['status'] == 'FAILED')
                    const CustomerText(
                      'Payment failed. You can try again.',
                      textAlign: TextAlign.center,
                    )
                  else if (purchase?['status'] == 'CANCELLING')
                    const CustomerText(
                      'PhonePe is confirming this payment. Check its status shortly.',
                      textAlign: TextAlign.center,
                    )
                  else if (expiresAt != null &&
                      !expiresAt.isAfter(DateTime.now()))
                    const CustomerText(
                      'Payment time ended. Check its status before trying again.',
                      textAlign: TextAlign.center,
                    )
                  else if (qr != null) ...[
                    Image.memory(
                      qr,
                      width: 210,
                      height: 210,
                      fit: BoxFit.contain,
                      semanticLabel: 'Payment QR code',
                    ),
                    const SizedBox(height: 8),
                    const CustomerText(
                      'Scan with another phone before this payment expires.',
                      textAlign: TextAlign.center,
                    ),
                  ] else
                    CustomerText(
                      isUpi
                          ? 'Payment QR is unavailable. You can still pay through UPI.'
                          : 'Payment QR is unavailable. Open PhonePe checkout to continue.',
                      textAlign: TextAlign.center,
                    ),
                  if (purchase?['status'] == 'PENDING' &&
                      !cancellingPayment &&
                      isUpi &&
                      Platform.isAndroid &&
                      (expiresAt == null ||
                          expiresAt.isAfter(DateTime.now()))) ...[
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                vertical: 10,
                                horizontal: 6,
                              ),
                            ),
                            onPressed: qr == null
                                ? null
                                : () async {
                                    try {
                                      await upiChannel.invokeMethod<bool>(
                                        'shareQr',
                                        {'uri': checkout, 'png': qr},
                                      );
                                    } catch (_) {
                                      if (dialogContext.mounted) {
                                        ScaffoldMessenger.of(
                                          dialogContext,
                                        ).showSnackBar(
                                          const SnackBar(
                                            content: CustomerText(
                                              'Payment QR could not be shared.',
                                            ),
                                          ),
                                        );
                                      }
                                    }
                                  },
                            child: const Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.share_outlined, size: 21),
                                SizedBox(height: 4),
                                CustomerText(
                                  'Share QR',
                                  textAlign: TextAlign.center,
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                vertical: 10,
                                horizontal: 6,
                              ),
                            ),
                            onPressed: () async {
                              try {
                                await upiChannel.invokeMethod<bool>(
                                  'shareLink',
                                  {'uri': checkout},
                                );
                              } catch (_) {
                                if (dialogContext.mounted) {
                                  ScaffoldMessenger.of(
                                    dialogContext,
                                  ).showSnackBar(
                                    const SnackBar(
                                      content: CustomerText(
                                        'Payment link could not be shared.',
                                      ),
                                    ),
                                  );
                                }
                              }
                            },
                            child: const Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.link_rounded, size: 21),
                                SizedBox(height: 4),
                                CustomerText(
                                  'Share payment link',
                                  textAlign: TextAlign.center,
                                  maxLines: 2,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed:
                          purchase?['status'] != 'PENDING' ||
                              cancellingPayment ||
                              (expiresAt != null &&
                                  !expiresAt.isAfter(DateTime.now()))
                          ? null
                          : () async {
                              bool opened = false;
                              try {
                                opened = await launchUrl(
                                  Uri.parse(checkout),
                                  mode: LaunchMode.externalApplication,
                                );
                              } catch (_) {
                                opened = false;
                              }
                              if (!opened && dialogContext.mounted) {
                                ScaffoldMessenger.of(
                                  dialogContext,
                                ).showSnackBar(
                                  SnackBar(
                                    content: CustomerText(
                                      isUpi
                                          ? 'UPI payment could not be opened.'
                                          : 'PhonePe checkout could not be opened.',
                                    ),
                                  ),
                                );
                              }
                            },
                      child: CustomerText(
                        isUpi ? 'Pay through UPI' : 'Open PhonePe checkout',
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  TextButton(
                    onPressed: cancellingPayment
                        ? null
                        : paymentOpen
                        ? () => confirmLeavePayment(dialogContext)
                        : () => closePaymentDialog(dialogContext),
                    child: CustomerText(
                      cancellingPayment
                          ? 'Cancelling payment…'
                          : paymentOpen
                          ? 'Leave payment'
                          : 'Done',
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> confirmLeavePayment(BuildContext dialogContext) async {
    if (!dialogContext.mounted || confirmingLeave || cancellingPayment) return;
    confirmingLeave = true;
    try {
      final leave = await showModalBottomSheet<bool>(
        context: dialogContext,
        isScrollControlled: true,
        builder: (sheetContext) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                CustomerText(
                  'Leave payment?',
                  style: Theme.of(sheetContext).textTheme.titleLarge,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                const CustomerText(
                  'We will ask PhonePe to cancel this payment. If it has already been paid, your credits will still be added.',
                  textAlign: TextAlign.center,
                ),
                if (paymentExpiry != null &&
                    paymentExpiry!.isAfter(DateTime.now())) ...[
                  const SizedBox(height: 10),
                  CustomerText(
                    'QR time left  ${remainingTime(paymentExpiry!)}',
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 22),
                FilledButton(
                  onPressed: () => Navigator.pop(sheetContext, false),
                  child: const CustomerText('Continue payment'),
                ),
                OutlinedButton(
                  onPressed: () => Navigator.pop(sheetContext, true),
                  child: const CustomerText('Leave payment'),
                ),
              ],
            ),
          ),
        ),
      );
      if (leave != true || !dialogContext.mounted) return;
      final id = purchase?['id'] as String?;
      if (id == null) return;
      cancellingPayment = true;
      paymentNow.value = DateTime.now();
      try {
        final next = await widget.experience.auth.authorized(
          '/mobile-payments/$id/cancel',
          method: 'POST',
        );
        if (!mounted || !dialogContext.mounted) return;
        setState(() => purchase = next);
        if (next['status'] == 'PAID') {
          try {
            await refresh();
          } catch (_) {
            // Payment remains confirmed; the balance can refresh later.
          }
        }
        if (!dialogContext.mounted) return;
        if ([
          'CANCELLED',
          'PAID',
          'FAILED',
          'CANCELLING',
        ].contains(next['status'])) {
          if (dialogContext.mounted) closePaymentDialog(dialogContext);
        } else {
          ScaffoldMessenger.of(dialogContext).showSnackBar(
            const SnackBar(
              content: CustomerText(
                'Payment is still being confirmed. Please check its status before retrying.',
              ),
            ),
          );
        }
      } catch (_) {
        final next = await checkPayment();
        if (!dialogContext.mounted) return;
        if (next != null &&
            ['PAID', 'FAILED', 'CANCELLED'].contains(next['status'])) {
          closePaymentDialog(dialogContext);
        } else if (purchase?['checkoutUrl'] is String &&
            !((purchase!['checkoutUrl'] as String).startsWith('upi:'))) {
          setState(
            () => paymentError =
                'This older payment could not be cancelled. Check its status before retrying.',
          );
          closePaymentDialog(dialogContext);
        } else {
          ScaffoldMessenger.of(dialogContext).showSnackBar(
            const SnackBar(
              content: CustomerText(
                'Cancellation was not confirmed. This payment remains pending.',
              ),
            ),
          );
        }
      } finally {
        cancellingPayment = false;
        if (mounted) paymentNow.value = DateTime.now();
      }
    } finally {
      confirmingLeave = false;
    }
  }

  void closePaymentDialog(BuildContext dialogContext) {
    final route = ModalRoute.of(dialogContext);
    if (route != null && route.isActive) {
      Navigator.of(dialogContext).removeRoute(route);
    }
  }

  Future<void> loadPending() async {
    try {
      final latest = await widget.experience.auth.authorized(
        '/mobile-payments',
      );
      if (mounted && latest['purchase'] is Map<String, dynamic>) {
        setState(() => purchase = latest['purchase'] as Json);
        paymentNow.value = DateTime.now();
      }
    } catch (_) {
      /* Plans can still be viewed when payment history is unavailable. */
    }
  }

  Future<Json?> checkPayment() async {
    final id = purchase?['id'] as String?;
    if (id == null || checking) return null;
    setState(() {
      checking = true;
      paymentError = null;
    });
    try {
      final next = await widget.experience.auth.authorized(
        '/mobile-payments/$id',
      );
      if (!mounted) return null;
      setState(() => purchase = next);
      paymentNow.value = DateTime.now();
      if (next['status'] == 'PAID') await refresh();
      return next;
    } catch (error) {
      if (mounted) setState(() => paymentError = error.toString());
      return null;
    } finally {
      if (mounted) setState(() => checking = false);
    }
  }

  Future<void> refresh() async {
    final next = widget.experience.auth.authorized('/mobile-plans');
    setState(() => mobilePlans = next);
    await Future.wait([widget.experience.refresh(), next]);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const CustomerText('Plans & credits')),
    backgroundColor: Colors.white,
    body: ListenableBuilder(
      listenable: Listenable.merge([widget.experience, paymentNow]),
      builder: (context, _) {
        final experience = widget.experience;
        final trial = experience.summary?['trial'] as Map?;
        final paid = experience.summary?['paid'] as Map?;
        return RefreshIndicator(
          onRefresh: refresh,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
            children: [
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: CustomerColors.ink,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.auto_awesome_rounded,
                      color: CustomerColors.orange,
                      size: 28,
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const CustomerText(
                            'Personal credits',
                            style: TextStyle(color: Colors.white70),
                          ),
                          CustomerText(
                            '${experience.remaining ?? '—'} Try-Ons left',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 21,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          CustomerText(
                            '${trial?['remaining'] ?? 0} trial · ${paid?['remaining'] ?? 0} paid',
                            style: const TextStyle(color: Colors.white70),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              FutureBuilder<Json>(
                future: mobilePlans,
                builder: (context, snapshot) {
                  if (snapshot.connectionState != ConnectionState.done) {
                    return const LinearProgressIndicator();
                  }
                  if (snapshot.hasError) {
                    return const CustomerNotice(
                      'Mobile plans could not be loaded. Pull down to retry.',
                      error: true,
                    );
                  }
                  final plans = (snapshot.data?['data'] as List? ?? const []);
                  final unitPriceCents =
                      snapshot.data?['unitPriceCents'] as int?;
                  final quantity = int.tryParse(customCredits.text.trim());
                  final validQuantity =
                      quantity != null && quantity >= 1 && quantity <= 1000;
                  final availablePlans = <Json>[
                    for (final item in plans)
                      if (item is Map) Map<String, dynamic>.from(item),
                  ];
                  final periodPlans = availablePlans
                      .where(
                        (item) =>
                            item['billingPeriod'] == selectedBillingPeriod,
                      )
                      .toList();
                  final selectedPlan = periodPlans.isEmpty
                      ? null
                      : periodPlans.firstWhere(
                          (item) => item['id'] == selectedPlanId,
                          orElse: () => periodPlans.first,
                        );
                  final canBuyPlan =
                      snapshot.data?['purchasingAvailable'] == true &&
                      selectedPlan?['id'] is String &&
                      selectedPlan?['currency'] == 'INR' &&
                      (selectedPlan?['priceCents'] as num? ?? 0) >= 100;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CustomerText(
                        'Go Premium',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 3),
                      const CustomerText(
                        'More Try-Ons. More styles. More you.',
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: _PlanPeriodTab(
                              label: 'Monthly',
                              selected: selectedBillingPeriod == 'MONTHLY',
                              onTap: () => setState(() {
                                selectedBillingPeriod = 'MONTHLY';
                                selectedPlanId = null;
                              }),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: _PlanPeriodTab(
                              label: 'One-time',
                              selected: selectedBillingPeriod == 'ONE_TIME',
                              onTap: () => setState(() {
                                selectedBillingPeriod = 'ONE_TIME';
                                selectedPlanId = null;
                              }),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      if (periodPlans.isEmpty)
                        CustomerNotice(
                          availablePlans.isEmpty
                              ? 'No mobile plans are available yet.'
                              : 'No plans are available in this category yet.',
                        ),
                      for (final item in periodPlans)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: _PlanChoiceCard(
                            plan: item,
                            selected: identical(item, selectedPlan),
                            onTap: () => setState(
                              () => selectedPlanId = item['id'] as String?,
                            ),
                          ),
                        ),
                      if (periodPlans.isNotEmpty) ...[
                        const SizedBox(height: 2),
                        CustomerText(
                          selectedBillingPeriod == 'MONTHLY'
                              ? 'Monthly credits expire after one month. Pay again to renew; no automatic charge.'
                              : 'One-time credits do not expire.',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed:
                                purchasing ||
                                    !canBuyPlan ||
                                    (paymentOpen && !retryReady)
                                ? null
                                : () => buy(
                                    planId: selectedPlan!['id'] as String,
                                  ),
                            child: CustomerText(
                              purchasing ? 'Opening checkout…' : 'Continue',
                            ),
                          ),
                        ),
                      ],
                      const SizedBox(height: 24),
                      const Divider(),
                      const SizedBox(height: 12),
                      PremiumPanel(
                        padding: const EdgeInsets.all(18),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            CustomerText(
                              'Buy credits',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            const SizedBox(height: 4),
                            const CustomerText(
                              'Choose 1 to 1,000 credits. They do not expire.',
                            ),
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                Expanded(
                                  child: TextField(
                                    controller: customCredits,
                                    keyboardType: TextInputType.number,
                                    decoration: const InputDecoration(
                                      labelText: 'Credits',
                                      border: OutlineInputBorder(),
                                    ),
                                    onChanged: (_) => setState(() {}),
                                  ),
                                ),
                                if (unitPriceCents != null &&
                                    validQuantity) ...[
                                  const SizedBox(width: 12),
                                  CustomerText(
                                    intl.NumberFormat.simpleCurrency(
                                      name: 'INR',
                                    ).format(quantity * unitPriceCents / 100),
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleMedium,
                                  ),
                                ],
                              ],
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton(
                                onPressed:
                                    purchasing ||
                                        (paymentOpen && !retryReady) ||
                                        !validQuantity ||
                                        unitPriceCents == null ||
                                        snapshot.data?['customPurchasingAvailable'] !=
                                            true
                                    ? null
                                    : () => buy(credits: quantity),
                                child: CustomerText(
                                  purchasing
                                      ? 'Opening checkout…'
                                      : 'Buy credits',
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (snapshot.data?['purchasingAvailable'] != true)
                        const CustomerNotice(
                          'Purchases are unavailable until SelfX enables mobile payments.',
                        ),
                      if (purchase != null) ...[
                        const SizedBox(height: 12),
                        CustomerNotice(
                          purchase!['status'] == 'PAID'
                              ? 'Payment confirmed. Credits are ready.'
                              : purchase!['status'] == 'CANCELLED'
                              ? 'Payment cancelled. No credits were added. You can start a new purchase.'
                              : purchase!['status'] == 'CANCELLING'
                              ? 'PhonePe is confirming this payment. Check its status before retrying.'
                              : purchase!['status'] == 'FAILED'
                              ? 'Payment failed. No credits were charged.'
                              : paymentExpiry != null &&
                                    !paymentExpiry!.isAfter(DateTime.now())
                              ? retryReady
                                    ? 'Payment time ended. Check its status before trying again.'
                                    : 'Payment time ended. Checking for a late confirmation. Retry in ${remainingTime(retryAvailableAt!)}.'
                              : 'Payment pending. Complete it before the timer ends. Credits appear after PhonePe confirms payment.',
                        ),
                        if (purchase!['status'] == 'PENDING' &&
                            paymentExpiry?.isAfter(DateTime.now()) == true)
                          TextButton(
                            onPressed: showPaymentOptions,
                            child: const CustomerText('Payment options'),
                          ),
                        if (paymentOpen)
                          TextButton(
                            onPressed: checking
                                ? null
                                : () => unawaited(checkPayment()),
                            child: CustomerText(
                              checking ? 'Checking…' : 'Check payment',
                            ),
                          ),
                        if (paymentOpen && retryReady)
                          TextButton(
                            onPressed: purchasing || checking
                                ? null
                                : () => buy(
                                    planId: purchase!['planId'] as String?,
                                    credits: purchase!['planId'] == null
                                        ? purchase!['credits'] as int?
                                        : null,
                                  ),
                            child: const CustomerText('Try again'),
                          ),
                      ],
                      if (paymentError != null)
                        CustomerNotice(paymentError!, error: true),
                    ],
                  );
                },
              ),
              const SizedBox(height: 24),
              const CustomerText(
                'Visiting a participating Store?',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              const CustomerText(
                'Scan its QR from Home to explore its products. The Store pays for eligible Try-Ons in that session; your own credits stay separate.',
              ),
              if (experience.error != null) ...[
                const SizedBox(height: 18),
                CustomerNotice(experience.error!, error: true),
              ],
            ],
          ),
        );
      },
    ),
  );
}

class _PlanPeriodTab extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _PlanPeriodTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    child: Material(
      color: selected ? CustomerColors.orange : Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? CustomerColors.orange : CustomerColors.line,
            ),
          ),
          child: CustomerText(
            label,
            style: TextStyle(
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ),
      ),
    ),
  );
}

class _PlanChoiceCard extends StatelessWidget {
  final Json plan;
  final bool selected;
  final VoidCallback onTap;

  const _PlanChoiceCard({
    required this.plan,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final price = intl.NumberFormat.simpleCurrency(
      name: plan['currency'] as String? ?? 'INR',
    ).format((plan['priceCents'] as num? ?? 0) / 100);
    final description = plan['description'] as String? ?? '';
    final trialCredits = plan['trialCredits'] as num? ?? 0;
    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: selected ? CustomerColors.tint : Colors.white,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: selected ? CustomerColors.orange : CustomerColors.line,
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  selected
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off,
                  color: selected
                      ? CustomerColors.orange
                      : CustomerColors.muted,
                  size: 22,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      CustomerText(
                        plan['name'] as String? ?? 'Mobile plan',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      if (description.isNotEmpty)
                        CustomerText(
                          description,
                          style: Theme.of(context).textTheme.bodySmall,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      CustomerText('${plan['includedCredits']} Try-On credits'),
                      if (trialCredits > 0)
                        CustomerText(
                          '+$trialCredits intro credits on your first purchase',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                CustomerText(
                  price,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class CustomerStudio extends StatefulWidget {
  final CustomerExperience experience;
  final CustomerPhotoPicker picker;
  const CustomerStudio({
    super.key,
    required this.experience,
    required this.picker,
  });
  @override
  State<CustomerStudio> createState() => _CustomerStudioState();
}

class _CustomerStudioState extends State<CustomerStudio> {
  bool picking = false;
  String? error;
  CustomerExperience get exp => widget.experience;
  Future<void> action(Future<void> Function() operation) async {
    if (picking || exp.busy) return;
    setState(() {
      picking = true;
      error = null;
    });
    try {
      await operation();
    } catch (e) {
      if (mounted) setState(() => error = CustomerExperience.message(e));
    } finally {
      if (mounted) setState(() => picking = false);
    }
  }

  Future<void> pick(String purpose) => action(() async {
    final source = await showModalBottomSheet<CustomerPhotoSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const CustomerText('Choose from photos'),
              onTap: () => Navigator.pop(context, CustomerPhotoSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const CustomerText('Take a photo'),
              onTap: () => Navigator.pop(context, CustomerPhotoSource.camera),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;
    final sessionId = exp.session?['id'];
    final photo = await widget.picker.pick(source);
    if (photo == null ||
        !mounted ||
        sessionId == null ||
        exp.session?['id'] != sessionId) {
      return;
    }
    await exp.upload(purpose, photo.bytes, photo.mime);
  });
  Future<void> pickDemoModel() async {
    final model = await showModalBottomSheet<Json>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          children: [
            CustomerText(
              'Choose a demo model',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            for (final item in exp.demoModels)
              if (demoModelImage(item['id'] as String) case final String image)
                if (exp.demoProduct == null ||
                    item['category'] == exp.demoProduct!['category'])
                  ListTile(
                    leading: ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.asset(
                        image,
                        width: 48,
                        height: 56,
                        fit: BoxFit.cover,
                      ),
                    ),
                    title: CustomerText(item['name'] as String),
                    onTap: () => Navigator.pop(context, item),
                  ),
          ],
        ),
      ),
    );
    if (model != null && mounted) {
      await action(() => exp.chooseDemoModel(model['id'] as String));
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: exp,
    builder: (context, _) {
      final result = exp.run?['result'];
      return Scaffold(
        appBar: AppBar(title: const CustomerText('Your fitting room')),
        body: exp.generating
            ? Padding(
                padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
                child: Column(
                  children: [
                    const Spacer(),
                    CustomerGeneratingLook(experience: exp),
                    const Spacer(),
                    _payer(exp),
                    if (exp.pollError != null) ...[
                      const SizedBox(height: 16),
                      CustomerNotice(exp.pollError!, error: true),
                      TextButton(
                        onPressed: exp.checkRun,
                        child: const CustomerText('Check progress'),
                      ),
                    ],
                  ],
                ),
              )
            : ListView(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 30),
                children: [
                  if (result is Json) ...[
                    CustomerText(
                      'Still entirely you.',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                    const SizedBox(height: 16),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(28),
                      child: AspectRatio(
                        aspectRatio: .72,
                        child: CustomerAssetImage(
                          experience: exp,
                          photo: CustomerPhoto.fromJson(result),
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                    if (exp.person != null &&
                        exp.person!.expiresAt.isAfter(DateTime.now())) ...[
                      const SizedBox(height: 20),
                      const CustomerText(
                        'Your original',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        height: 160,
                        child: CustomerAssetImage(
                          experience: exp,
                          photo: exp.person!,
                          fit: BoxFit.contain,
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton.icon(
                      onPressed: picking
                          ? null
                          : () => action(() async {
                              await downloadCustomerResult(
                                exp,
                                CustomerPhoto.fromJson(result),
                              );
                              if (context.mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: CustomerText('Look downloaded.'),
                                  ),
                                );
                              }
                            }),
                      icon: const Icon(Icons.download_rounded),
                      label: const CustomerText('Download look'),
                    ),
                    CustomerResultSuggestions(
                      experience: exp,
                      disabled: picking || exp.busy,
                      onSelect: (item) => action(() async {
                        await prepareCustomerStudio(
                          context,
                          exp,
                          product: exp.storeMode ? item : null,
                          demoProduct: exp.storeMode ? null : item,
                        );
                      }),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const CustomerText('Back to Home'),
                    ),
                  ] else if (exp.run?['status'] == 'FAILED' &&
                      exp.person == null) ...[
                    CustomerNotice(
                      exp.run!['message'] as String? ??
                          'This Try-On did not finish. Start again from Home.',
                      error: true,
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: () => Navigator.pop(context),
                      child: const CustomerText('Back to Home'),
                    ),
                  ] else ...[
                    CustomerText(
                      'Make it your own.',
                      style: Theme.of(context).textTheme.headlineLarge,
                    ),
                    const SizedBox(height: 12),
                    const CustomerText(
                      'A clear photo of you. One outfit you love. A new possibility.',
                    ),
                    const SizedBox(height: 20),
                    _payer(exp),
                    const SizedBox(height: 20),
                    if ((exp.usingAvatar || exp.demoModelId != null) &&
                        exp.person != null) ...[
                      SizedBox(
                        height: 200,
                        child: CustomerAssetImage(
                          experience: exp,
                          photo: exp.person!,
                          fit: BoxFit.contain,
                        ),
                      ),
                      const SizedBox(height: 12),
                      CustomerNotice(
                        exp.usingAvatar
                            ? 'Using your saved full-body photo. Changes apply to this Try-On only.'
                            : 'Using a demo model. Changes apply to this Try-On only.',
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (!exp.storeMode) ...[
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        children: [
                          OutlinedButton.icon(
                            onPressed: picking || exp.busy
                                ? null
                                : () => action(exp.chooseAvatar),
                            icon: const Icon(
                              Icons.person_outline_rounded,
                              size: 18,
                            ),
                            label: const CustomerText('My Avatar'),
                          ),
                          OutlinedButton.icon(
                            onPressed: picking || exp.busy
                                ? null
                                : pickDemoModel,
                            icon: const Icon(
                              Icons.people_outline_rounded,
                              size: 18,
                            ),
                            label: const CustomerText('Model'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                    ],
                    if (exp.avatarError != null) ...[
                      CustomerNotice(exp.avatarError!, error: true),
                      const SizedBox(height: 12),
                    ],
                    _PhotoCard(
                      label: 'Your photo',
                      buttonText: exp.person != null ? 'Change photo' : null,
                      hint:
                          'Face the camera, with the area you want to try on visible.',
                      bytes: exp.personPreview,
                      disabled: picking || exp.busy || exp.hasUncertainRequest,
                      onTap: () => pick('PERSON'),
                    ),
                    const SizedBox(height: 16),
                    if (exp.storeMode)
                      PremiumPanel(
                        child: Row(
                          children: [
                            const Icon(Icons.storefront_outlined),
                            const SizedBox(width: 12),
                            Expanded(
                              child: CustomerText(
                                exp.product?['name'] as String? ??
                                    'Store product',
                              ),
                            ),
                          ],
                        ),
                      )
                    else if (exp.demoProduct != null)
                      PremiumPanel(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const CustomerText(
                              'Selected outfit',
                              style: TextStyle(fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                if (demoProductImage(
                                      exp.demoProduct!['id'] as String,
                                    )
                                    case final String image)
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(12),
                                    child: Image.asset(
                                      image,
                                      width: 82,
                                      height: 104,
                                      fit: BoxFit.contain,
                                    ),
                                  ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: CustomerText(
                                    exp.demoProduct!['name'] as String,
                                    style: Theme.of(
                                      context,
                                    ).textTheme.titleMedium,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            TextButton.icon(
                              onPressed: picking || exp.busy
                                  ? null
                                  : () => pick('GARMENT'),
                              icon: const Icon(
                                Icons.add_photo_alternate_outlined,
                              ),
                              label: const CustomerText('Use my own outfit'),
                            ),
                          ],
                        ),
                      )
                    else
                      _PhotoCard(
                        label: 'Your outfit',
                        hint:
                            'Choose a clear clothing photo or photograph an outfit.',
                        bytes: exp.outfitPreview,
                        disabled:
                            picking || exp.busy || exp.hasUncertainRequest,
                        onTap: () => pick('GARMENT'),
                      ),
                    const SizedBox(height: 16),
                    const CustomerText(
                      'Use good light and a plain background. Original photos expire within 7 days.',
                      style: TextStyle(
                        fontSize: 12,
                        color: CustomerColors.muted,
                      ),
                    ),
                    if (exp.run?['status'] == 'FAILED') ...[
                      const SizedBox(height: 16),
                      CustomerNotice(
                        exp.run!['message'] as String,
                        error: true,
                      ),
                    ],
                    if (exp.hasUncertainRequest) ...[
                      const SizedBox(height: 16),
                      const CustomerNotice(
                        'Your request may already be processing. Check it again to continue safely; we will reuse the same request.',
                      ),
                    ],
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed:
                          picking ||
                              (!exp.canGenerate && !exp.hasUncertainRequest)
                          ? null
                          : () => action(exp.generate),
                      icon: const Icon(Icons.auto_awesome_rounded),
                      label: CustomerText(
                        exp.hasUncertainRequest
                            ? 'Check my request'
                            : 'Try on this outfit',
                      ),
                    ),
                  ],
                  if (exp.busy) ...[
                    const SizedBox(height: 16),
                    const LinearProgressIndicator(),
                    const SizedBox(height: 8),
                    const CustomerText(
                      'Please wait…',
                      textAlign: TextAlign.center,
                    ),
                  ],
                  if (error != null) ...[
                    const SizedBox(height: 16),
                    CustomerNotice(error!, error: true),
                  ],
                ],
              ),
      );
    },
  );
}

Widget _payer(CustomerExperience exp) => CustomerNotice(
  exp.run?['payer'] == 'STORE' && !exp.storeMode
      ? 'Store-sponsored Try-On. The Store pays; your personal credits are not used.'
      : exp.storeMode
      ? '${(exp.storeVisit!['store'] as Map)['name']} pays for this Try-On. Your personal credits will not be used.'
      : 'Personal Try-On · ${exp.remaining ?? 0} free trial credits left. One credit is used when a result is saved.',
);

class _PhotoCard extends StatelessWidget {
  final String label, hint;
  final String? buttonText;
  final Uint8List? bytes;
  final bool disabled;
  final VoidCallback onTap;
  const _PhotoCard({
    this.buttonText,
    required this.label,
    required this.hint,
    required this.bytes,
    required this.disabled,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) => PremiumPanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (bytes != null) ...[
          ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: Image.memory(
              bytes!,
              height: 200,
              width: double.infinity,
              fit: BoxFit.contain,
              gaplessPlayback: true,
            ),
          ),
          const SizedBox(height: 12),
        ],
        CustomerText(label, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        CustomerText(
          hint,
          style: const TextStyle(fontSize: 13, color: CustomerColors.muted),
        ),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: disabled ? null : onTap,
          icon: const Icon(Icons.add_a_photo_outlined, size: 20),
          label: CustomerText(
            buttonText ?? (bytes == null ? 'Add $label' : 'Change $label'),
          ),
        ),
      ],
    ),
  );
}

Future<void> downloadCustomerResult(
  CustomerExperience exp,
  CustomerPhoto photo,
) async {
  final bytes = await exp.auth.authorizedDownload(
    '/try-on/assets/${photo.id}/download',
  );
  await exportResult(bytes, 'SelfX-${photo.id}');
}

class CustomerAssetImage extends StatefulWidget {
  final CustomerExperience experience;
  final CustomerPhoto photo;
  final BoxFit fit;
  final Color backgroundColor;
  const CustomerAssetImage({
    super.key,
    required this.experience,
    required this.photo,
    this.fit = BoxFit.cover,
    this.backgroundColor = const Color(0xFFF0E7DA),
  });
  @override
  State<CustomerAssetImage> createState() => _CustomerAssetImageState();
}

class _CustomerAssetImageState extends State<CustomerAssetImage> {
  String? url;
  bool failed = false;
  int request = 0;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(load());
    });
  }

  @override
  void didUpdateWidget(CustomerAssetImage old) {
    super.didUpdateWidget(old);
    if (old.photo.id != widget.photo.id) {
      url = null;
      unawaited(load());
    }
  }

  Future<void> load() async {
    final id = ++request;
    try {
      final data = await widget.experience.auth.authorized(
        '/try-on/assets/${widget.photo.id}',
      );
      if (mounted && id == request) {
        setState(() {
          url = data['url'] as String;
          failed = false;
        });
      }
    } catch (_) {
      if (mounted && id == request) setState(() => failed = true);
    }
  }

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: widget.backgroundColor,
    child: failed
        ? Center(
            child: TextButton.icon(
              onPressed: () {
                setState(() {
                  failed = false;
                  url = null;
                });
                unawaited(load());
              },
              icon: const Icon(Icons.refresh),
              label: const CustomerText('Reload photo'),
            ),
          )
        : url == null
        ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
        : Image.network(
            url!,
            fit: widget.fit,
            gaplessPlayback: true,
            loadingBuilder: (context, child, progress) => progress == null
                ? child
                : const Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
            errorBuilder: (_, e, stack) => Center(
              child: TextButton.icon(
                onPressed: () {
                  setState(() => url = null);
                  unawaited(load());
                },
                icon: const Icon(Icons.refresh),
                label: const CustomerText('Reload photo'),
              ),
            ),
          ),
  );
}

class CustomerSavedScreen extends StatefulWidget {
  final CustomerExperience experience;
  final VoidCallback onHome;
  final VoidCallback onPlans;
  final Future<void> Function(Json item, bool store) onTryOnGarment;
  const CustomerSavedScreen({
    super.key,
    required this.experience,
    required this.onHome,
    required this.onPlans,
    required this.onTryOnGarment,
  });
  @override
  State<CustomerSavedScreen> createState() => _CustomerSavedScreenState();
}

class _CustomerSavedScreenState extends State<CustomerSavedScreen> {
  String? error;
  String? downloadingId;
  bool showGarments = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(load());
    });
  }

  Future<void> load({bool more = false}) async {
    try {
      if (more) {
        await widget.experience.loadSaved(more: true);
      } else {
        await Future.wait([
          widget.experience.loadSaved(),
          widget.experience.loadSavedGarments(),
        ]);
      }
      if (mounted) setState(() => error = null);
    } catch (e) {
      if (mounted) setState(() => error = CustomerExperience.message(e));
    }
  }

  Future<void> download(CustomerLook look) async {
    if (downloadingId != null) return;
    setState(() => downloadingId = look.id);
    try {
      await downloadCustomerResult(widget.experience, look.result);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: CustomerText('Look downloaded.')),
        );
      }
    } catch (caught) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: CustomerText(CustomerExperience.message(caught))),
        );
      }
    } finally {
      if (mounted) setState(() => downloadingId = null);
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.experience,
    builder: (context, _) {
      final exp = widget.experience;
      if (!showGarments && exp.savedLoading && exp.looks.isEmpty) {
        return const CustomerContentSkeleton(
          layout: CustomerSkeletonLayout.home,
        );
      }
      return RefreshIndicator(
        onRefresh: load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 10, 24, 28),
          children: [
            CustomerText(
              'Saved',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                for (final entry in [(false, 'Looks'), (true, 'Wardrobe')])
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: ChoiceChip(
                        label: Center(child: CustomerText(entry.$2)),
                        selected: showGarments == entry.$1,
                        onSelected: (_) =>
                            setState(() => showGarments = entry.$1),
                        showCheckmark: false,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 14),
            if (exp.remaining case final int credits when credits < 10) ...[
              Material(
                color: const Color(0xFF292E34),
                borderRadius: BorderRadius.circular(16),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: CustomerText(
                          '$credits credits left',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: widget.onPlans,
                        child: const CustomerText(
                          'Plans & credits',
                          style: TextStyle(color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
            ],
            if (error != null) ...[
              CustomerNotice(error!, error: true),
              TextButton(
                onPressed: load,
                child: const CustomerText('Try again'),
              ),
            ],
            if (showGarments && exp.savedGarments.isEmpty && error == null) ...[
              const SizedBox(height: 40),
              const Center(
                child: Icon(Icons.favorite_border_rounded, size: 48),
              ),
              const SizedBox(height: 14),
              const CustomerText(
                'Your saved garments will appear here.',
                textAlign: TextAlign.center,
              ),
            ],
            if (showGarments)
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: exp.savedGarments.length,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 8,
                  mainAxisSpacing: 12,
                  childAspectRatio: .68,
                ),
                itemBuilder: (context, index) {
                  final saved = exp.savedGarments[index];
                  final product = saved['product'] as Json?;
                  final store = saved['source'] == 'STORE';
                  final id = saved['id'] as String;
                  final image = store
                      ? ((product?['image'] as Map?)?['url'] as String?)
                      : demoProductImage(id);
                  return ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: Material(
                      color: CustomerColors.canvas,
                      child: InkWell(
                        onTap: product == null
                            ? null
                            : () => widget.onTryOnGarment(product, store),
                        child: Column(
                          children: [
                            Expanded(
                              child: Stack(
                                fit: StackFit.expand,
                                children: [
                                  image == null
                                      ? const Icon(Icons.checkroom_outlined)
                                      : store
                                      ? Image.network(image, fit: BoxFit.cover)
                                      : Image.asset(image, fit: BoxFit.cover),
                                  Align(
                                    alignment: Alignment.topRight,
                                    child: IconButton.filledTonal(
                                      tooltip: 'Remove saved garment',
                                      onPressed: () async {
                                        try {
                                          await exp.toggleSavedGarment(
                                            saved['source'] as String,
                                            id,
                                          );
                                        } catch (caught) {
                                          if (context.mounted) {
                                            ScaffoldMessenger.of(
                                              context,
                                            ).showSnackBar(
                                              SnackBar(
                                                content: CustomerText(
                                                  CustomerExperience.message(
                                                    caught,
                                                  ),
                                                ),
                                              ),
                                            );
                                          }
                                        }
                                      },
                                      icon: const Icon(Icons.favorite_rounded),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(4, 6, 4, 0),
                              child: CustomerText(
                                product?['name'] as String? ??
                                    'Unavailable garment',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
                              child: SizedBox(
                                width: double.infinity,
                                child: FilledButton.icon(
                                  onPressed: product == null
                                      ? null
                                      : () => widget.onTryOnGarment(
                                          product,
                                          store,
                                        ),
                                  style: FilledButton.styleFrom(
                                    minimumSize: const Size(0, 42),
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                    ),
                                    textStyle: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  icon: const Icon(
                                    Icons.auto_awesome_rounded,
                                    size: 16,
                                  ),
                                  label: const CustomerText('Try on'),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            if (!showGarments && exp.looks.isEmpty && error == null) ...[
              const SizedBox(height: 40),
              const Center(
                child: Icon(
                  Icons.bookmarks_outlined,
                  size: 54,
                  color: CustomerColors.orange,
                ),
              ),
              const SizedBox(height: 24),
              CustomerText(
                'Your first look\nis yet to come.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 16),
              const CustomerText(
                'Create a Try-On to start your collection. Download favourite results before they expire.',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              OutlinedButton(
                onPressed: widget.onHome,
                child: const CustomerText('Back to Home'),
              ),
            ],
            if (!showGarments)
              for (final look in exp.looks)
                Padding(
                  padding: const EdgeInsets.only(bottom: 20),
                  child: PremiumPanel(
                    padding: EdgeInsets.zero,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(10, 10, 10, 0),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(16),
                            child: AspectRatio(
                              aspectRatio: .9,
                              child: CustomerAssetImage(
                                experience: exp,
                                photo: look.result,
                                fit: BoxFit.contain,
                              ),
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                look.nameIsDefault
                                    ? tr(context, 'Your look')
                                    : look.name,
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                              const SizedBox(height: 6),
                              CustomerText(
                                'Expires ${_date(context, look.expiresAt)} · ${look.payer == 'STORE' ? 'Store sponsored' : 'Personal'}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: CustomerColors.muted,
                                ),
                              ),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  Expanded(
                                    child: OutlinedButton(
                                      onPressed: () async {
                                        await Navigator.push<void>(
                                          context,
                                          MaterialPageRoute(
                                            builder: (_) =>
                                                CustomerSavedLookScreen(
                                                  experience: exp,
                                                  look: look,
                                                ),
                                          ),
                                        );
                                        await load();
                                      },
                                      child: const CustomerText('View look'),
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  IconButton.filledTonal(
                                    tooltip: tr(context, 'Download look'),
                                    onPressed: downloadingId == null
                                        ? () => download(look)
                                        : null,
                                    icon: downloadingId == look.id
                                        ? const SizedBox(
                                            width: 20,
                                            height: 20,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                            ),
                                          )
                                        : const Icon(Icons.download_rounded),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            if (!showGarments && exp.hasMoreLooks)
              OutlinedButton(
                onPressed: exp.savedLoading ? null : () => load(more: true),
                child: CustomerText(
                  exp.savedLoading ? 'Loading…' : 'Load more looks',
                ),
              ),
          ],
        ),
      );
    },
  );
}

class CustomerSavedLookScreen extends StatefulWidget {
  final CustomerExperience experience;
  final CustomerLook look;
  const CustomerSavedLookScreen({
    super.key,
    required this.experience,
    required this.look,
  });
  @override
  State<CustomerSavedLookScreen> createState() =>
      _CustomerSavedLookScreenState();
}

class _CustomerSavedLookScreenState extends State<CustomerSavedLookScreen> {
  bool busy = false;
  String? error;
  Future<void> action(Future<void> Function() operation) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await operation();
    } catch (e) {
      if (mounted) setState(() => error = CustomerExperience.message(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        widget.look.nameIsDefault ? tr(context, 'Your look') : widget.look.name,
      ),
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(28),
          child: AspectRatio(
            aspectRatio: .72,
            child: CustomerAssetImage(
              experience: widget.experience,
              photo: widget.look.result,
              fit: BoxFit.contain,
            ),
          ),
        ),
        const SizedBox(height: 16),
        CustomerText(
          'Available until ${_date(context, widget.look.expiresAt)}',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        if (widget.look.person != null || widget.look.outfit != null) ...[
          CustomerText(
            'The starting point',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              for (final photo in [
                widget.look.person,
                widget.look.outfit,
              ].whereType<CustomerPhoto>())
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: SizedBox(
                      height: 170,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(20),
                        child: CustomerAssetImage(
                          experience: widget.experience,
                          photo: photo,
                          fit: BoxFit.contain,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          const CustomerText(
            'Original photos are available for up to 7 days.',
            style: TextStyle(fontSize: 12, color: CustomerColors.muted),
          ),
          const SizedBox(height: 24),
        ],
        FilledButton.icon(
          onPressed: busy
              ? null
              : () => action(() async {
                  await downloadCustomerResult(
                    widget.experience,
                    widget.look.result,
                  );
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: CustomerText('Look downloaded.')),
                    );
                  }
                }),
          icon: const Icon(Icons.download_rounded),
          label: const CustomerText('Download look'),
        ),
        TextButton(
          onPressed: busy
              ? null
              : () => action(() async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const CustomerText('Delete this look?'),
                      content: const CustomerText(
                        'This removes the saved result. Used credits are not restored.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const CustomerText('Cancel'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const CustomerText('Delete'),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true) {
                    await widget.experience.deleteLook(widget.look);
                    if (context.mounted) Navigator.pop(context);
                  }
                }),
          child: const CustomerText('Delete look'),
        ),
        if (error != null) CustomerNotice(error!, error: true),
      ],
    ),
  );
}

String _date(BuildContext context, DateTime value) =>
    CustomerCopy.of(context).date(value);

class CustomerStoreCatalog extends StatelessWidget {
  final CustomerExperience experience;
  final void Function(Json) onTryOn;
  final VoidCallback onLeave;
  final Future<void> Function() onRefresh;
  final VoidCallback onMore;
  const CustomerStoreCatalog({
    super.key,
    required this.experience,
    required this.onTryOn,
    required this.onLeave,
    required this.onRefresh,
    required this.onMore,
  });
  Future<void> toggleSaved(BuildContext context, String id) async {
    try {
      await experience.toggleSavedGarment('STORE', id);
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: CustomerText(CustomerExperience.message(error))),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final store = experience.storeVisit!['store'] as Map;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          const CustomerText(
            'YOUR STORE VISIT',
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 2,
              color: CustomerColors.muted,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            store['name'] as String,
            style: Theme.of(context).textTheme.headlineLarge,
          ),
          const SizedBox(height: 16),
          CustomerNotice(
            'The Store pays · Up to ${experience.storeVisit!['dailyCustomerLimit']} Try-Ons per day. Your personal credits will not be used.',
          ),
          TextButton(
            onPressed: onLeave,
            child: const CustomerText('Leave Store session'),
          ),
          const SizedBox(height: 16),
          if (experience.generating || experience.hasUncertainRequest)
            FilledButton(
              onPressed: () => onTryOn({}),
              child: const CustomerText('Open current Try-On'),
            ),
          if (experience.productsLoading && experience.products.isEmpty)
            const LinearProgressIndicator(),
          if (experience.productsError != null) ...[
            CustomerNotice(experience.productsError!, error: true),
            TextButton(
              onPressed: onRefresh,
              child: const CustomerText('Reload products'),
            ),
          ],
          if (!experience.productsLoading &&
              experience.productsError == null &&
              experience.products.isEmpty)
            const PremiumPanel(
              child: CustomerText(
                'No eligible products are available yet. Ask the Store to enable its products for Try-On.',
              ),
            ),
          for (final product in experience.products)
            Padding(
              padding: const EdgeInsets.only(bottom: 20),
              child: PremiumPanel(
                padding: EdgeInsets.zero,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      height: 240,
                      width: double.infinity,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          if ((product['image'] as Map?)?['url']
                              case final String url)
                            Image.network(url, fit: BoxFit.cover)
                          else
                            const Icon(Icons.checkroom_rounded, size: 48),
                          Align(
                            alignment: Alignment.topRight,
                            child: IconButton.filledTonal(
                              tooltip:
                                  experience.isGarmentSaved(
                                    'STORE',
                                    product['id'] as String,
                                  )
                                  ? 'Remove from saved garments'
                                  : 'Save garment',
                              onPressed: () =>
                                  toggleSaved(context, product['id'] as String),
                              icon: Icon(
                                experience.isGarmentSaved(
                                      'STORE',
                                      product['id'] as String,
                                    )
                                    ? Icons.favorite_rounded
                                    : Icons.favorite_border_rounded,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text(
                        product['name'] as String,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      child: SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: () => onTryOn(product),
                          icon: const Icon(Icons.auto_awesome_outlined),
                          label: const CustomerText('Try on me'),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (experience.hasMoreProducts)
            OutlinedButton(
              onPressed: experience.productsLoading ? null : onMore,
              child: const CustomerText('Load more products'),
            ),
        ],
      ),
    );
  }
}

class CustomerStoreScanner extends StatefulWidget {
  const CustomerStoreScanner({super.key});
  @override
  State<CustomerStoreScanner> createState() => _CustomerStoreScannerState();
}

class _CustomerStoreScannerState extends State<CustomerStoreScanner>
    with WidgetsBindingObserver {
  final text = TextEditingController();
  final scanner = MobileScannerController(
    formats: [BarcodeFormat.qrCode],
    autoStart: false,
  );
  bool camera = false, returned = false;
  String? error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!camera) return;
    if (state == AppLifecycleState.resumed) {
      unawaited(startCamera());
    } else {
      unawaited(scanner.stop());
    }
  }

  Future<void> startCamera() async {
    try {
      await scanner.start();
    } catch (_) {
      if (mounted) {
        setState(
          () => error =
              'Camera access is unavailable. Allow it in device settings, or paste the Store code below.',
        );
      }
    }
  }

  void accept(String value) {
    if (!mounted || returned) return;
    final raw = value.trim();
    final uri = Uri.tryParse(raw);
    if (!RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(raw) &&
        !(uri?.scheme == 'selfx' && uri?.host == 'store')) {
      setState(() => error = 'Use a SelfX Store QR code.');
      return;
    }
    returned = true;
    unawaited(scanner.stop());
    Navigator.pop(context, raw);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(scanner.dispose());
    text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const CustomerText('Visit a Store')),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        CustomerText(
          'Scan. Discover.\nMake it yours.',
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        const SizedBox(height: 16),
        const CustomerText(
          'Scan a participating Store’s SelfX QR. Its products and sponsorship will appear before you try on.',
        ),
        const SizedBox(height: 24),
        if (camera)
          ClipRRect(
            borderRadius: BorderRadius.circular(26),
            child: SizedBox(
              height: 300,
              child: MobileScanner(
                controller: scanner,
                onDetect: (capture) {
                  for (final barcode in capture.barcodes) {
                    if (barcode.rawValue != null) {
                      accept(barcode.rawValue!);
                      break;
                    }
                  }
                },
                errorBuilder: (_, e) => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CustomerText(
                      'Camera unavailable. Allow camera access in device settings or paste the Store code below.',
                    ),
                  ),
                ),
              ),
            ),
          )
        else
          PremiumPanel(
            child: Column(
              children: [
                const Icon(
                  Icons.qr_code_scanner_rounded,
                  size: 64,
                  color: CustomerColors.orange,
                ),
                const SizedBox(height: 16),
                const CustomerText(
                  'The camera scans on your device. Camera frames are not uploaded.',
                ),
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () {
                    setState(() => camera = true);
                    WidgetsBinding.instance.addPostFrameCallback(
                      (_) => unawaited(startCamera()),
                    );
                  },
                  child: const CustomerText('Open camera'),
                ),
              ],
            ),
          ),
        const SizedBox(height: 24),
        TextField(
          controller: text,
          textDirection: TextDirection.ltr,
          autocorrect: false,
          enableSuggestions: false,
          decoration: InputDecoration(
            labelText: tr(context, 'Or paste the SelfX Store code'),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () => accept(text.text),
          child: const CustomerText('Open Store'),
        ),
        if (error != null) ...[
          const SizedBox(height: 16),
          CustomerNotice(error!, error: true),
        ],
      ],
    ),
  );
}

class PremiumPanel extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  const PremiumPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(22),
  });
  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: .86),
      borderRadius: BorderRadius.circular(26),
      border: Border.all(color: CustomerColors.line),
      boxShadow: const [
        BoxShadow(
          color: Color(0x06A45A23),
          blurRadius: 24,
          offset: Offset(0, 8),
        ),
      ],
    ),
    child: child,
  );
}
