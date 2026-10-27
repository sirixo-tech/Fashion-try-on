import '../l10n/customer_copy.dart';
import 'dart:async';
import '../services/customer_push.dart';
import 'customer_service_screens.dart';
import 'customer_code_screen.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import '../experience/customer_experience.dart';
import '../experience/customer_media.dart';
import 'customer_experience_screens.dart';
import 'customer_theme.dart';
import 'customer_skeleton.dart';
import '../l10n/customer_language.dart';
import '../l10n/customer_language_screen.dart';

class CustomerShell extends StatefulWidget {
  final CustomerController controller;
  final CustomerPhotoPicker? picker;
  const CustomerShell({super.key, required this.controller, this.picker});
  @override
  State<CustomerShell> createState() => _CustomerShellState();
}

class _CustomerShellState extends State<CustomerShell>
    with WidgetsBindingObserver {
  late final CustomerExperience experience;
  late final CustomerPushRegistration pushRegistration;
  late final CustomerPhotoPicker picker;
  int tab = 0;
  bool busy = false;
  CustomerController get auth => widget.controller;
  @override
  void initState() {
    super.initState();
    experience = CustomerExperience(auth);
    pushRegistration = CustomerPushRegistration(
      auth,
      NativeCustomerPush(),
      onNotification: showLookNotice,
      onOpened: () {
        if (mounted) unawaited(notifications());
      },
    );
    unawaited(restorePhoneAlerts());
    picker = widget.picker ?? NativeCustomerPhotoPicker();
    unawaited(experience.refresh());
    unawaited(picker.discardLost());
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      experience.resume();
    } else {
      experience.pause();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    experience.dispose();
    unawaited(pushRegistration.dispose());
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
    super.dispose();
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) return;
    setState(() => busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: CustomerText(CustomerExperience.message(e))),
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> notifications() => Navigator.push<void>(
    context,
    MaterialPageRoute(
      builder: (_) => CustomerNotificationsScreen(
        auth: auth,
        experience: experience,
        registration: pushRegistration,
      ),
    ),
  );
  Future<void> restorePhoneAlerts() async {
    if (auth.profile?.notifications != true) return;
    try {
      await pushRegistration.enable(
        requestPermission: false,
        onNotification: () {},
      );
    } catch (_) {
      /* Inbox remains available when phone alerts are unavailable. */
    }
  }

  void showLookNotice() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const CustomerText('Your look is ready.'),
        action: SnackBarAction(
          label: tr(context, 'View'),
          onPressed: notifications,
        ),
      ),
    );
  }

  Future<void> unavailable(String title, String message) =>
      customerInfo(context, title, message);
  Future<void> plans() => Navigator.push<void>(
    context,
    MaterialPageRoute(
      builder: (_) => CustomerPlansScreen(experience: experience),
    ),
  );
  Future<void> scanStore() => run(() async {
    final payload = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => const CustomerStoreScanner()),
    );
    if (payload != null) {
      await experience.joinStore(payload);
      if (mounted) setState(() => tab = 0);
    }
  });
  Future<void> studio({Json? product}) => run(
    () => openCustomerStudio(context, experience, picker, product: product),
  );
  Future<void> erasePhotos() => run(() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const CustomerText('Delete all photos?'),
        content: const CustomerText(
          'Your uploaded photos and generated looks will be removed. This also ends active Try-Ons and Store sessions. Used trial credits are not reset.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const CustomerText('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const CustomerText('Delete photos'),
          ),
        ],
      ),
    );
    if (yes == true) {
      await experience.erasePhotos();
      PaintingBinding.instance.imageCache.clear();
      PaintingBinding.instance.imageCache.clearLiveImages();
    }
  });
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: experience,
    builder: (context, _) => Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 12, 12),
              child: Row(
                children: [
                  const Expanded(
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: CustomerBrand(compact: true),
                      ),
                    ),
                  ),
                  Expanded(
                    flex: 2,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        IconButton(
                          tooltip: tr(context, 'Scan Store QR'),
                          onPressed: busy ? null : scanStore,
                          icon: const Icon(
                            Icons.qr_code_scanner_rounded,
                            size: 24,
                          ),
                        ),
                        Flexible(
                          flex: 2,
                          child: TextButton(
                            onPressed: plans,
                            child: const CustomerText(
                              'Plans',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                        Tooltip(
                          message: tr(
                            context,
                            'Personal free trial credits. Store-sponsored usage is separate.',
                          ),
                          child: Material(
                            color: CustomerColors.tint,
                            borderRadius: BorderRadius.circular(24),
                            child: InkWell(
                              borderRadius: BorderRadius.circular(24),
                              onTap: plans,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 12,
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(
                                      Icons.auto_awesome_rounded,
                                      color: CustomerColors.orange,
                                      size: 17,
                                    ),
                                    const SizedBox(width: 5),
                                    CustomerText(
                                      experience.remaining?.toString() ?? '—',
                                      semanticsLabel:
                                          'Personal credits: ${experience.remaining ?? 'unavailable'}',
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: IndexedStack(
                index: tab,
                children: [
                  home(context),
                  CustomerSavedScreen(
                    experience: experience,
                    onHome: () => setState(() => tab = 0),
                  ),
                  auth.profileLoading
                      ? const CustomerContentSkeleton(
                          layout: CustomerSkeletonLayout.account,
                        )
                      : account(context),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        minimum: const EdgeInsets.fromLTRB(20, 8, 20, 14),
        child: Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: .95),
            borderRadius: BorderRadius.circular(40),
            border: Border.all(color: CustomerColors.line),
            boxShadow: const [
              BoxShadow(
                color: Color(0x08000000),
                blurRadius: 30,
                offset: Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            children: [
              nav('Home', Icons.home_outlined, Icons.home_rounded, 0),
              nav(
                'Saved',
                Icons.bookmarks_outlined,
                Icons.bookmarks_rounded,
                1,
              ),
              nav('Me', Icons.person_outline_rounded, Icons.person_rounded, 2),
            ],
          ),
        ),
      ),
    ),
  );
  Widget nav(String label, IconData icon, IconData selectedIcon, int value) =>
      Expanded(
        child: Semantics(
          selected: tab == value,
          button: true,
          child: InkWell(
            borderRadius: BorderRadius.circular(32),
            onTap: () {
              setState(() => tab = value);
              if (value == 1) unawaited(run(experience.loadSaved));
            },
            child: AnimatedContainer(
              duration: MediaQuery.disableAnimationsOf(context)
                  ? Duration.zero
                  : const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: tab == value ? CustomerColors.tint : Colors.transparent,
                borderRadius: BorderRadius.circular(32),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    tab == value ? selectedIcon : icon,
                    size: 24,
                    color: tab == value
                        ? const Color(0xFFA7490C)
                        : CustomerColors.muted,
                  ),
                  const SizedBox(height: 4),
                  CustomerText(
                    label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: tab == value
                          ? FontWeight.w700
                          : FontWeight.w500,
                      color: tab == value
                          ? const Color(0xFFA7490C)
                          : CustomerColors.muted,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
  Widget home(BuildContext context) {
    if (experience.loading) {
      return const CustomerContentSkeleton(layout: CustomerSkeletonLayout.home);
    }
    if (experience.storeMode) {
      return CustomerStoreCatalog(
        experience: experience,
        onTryOn: (product) => studio(product: product),
        onLeave: () => run(experience.leaveStore),
        onRefresh: () => run(experience.loadProducts),
        onMore: () => run(() => experience.loadProducts(more: true)),
      );
    }
    return RefreshIndicator(
      onRefresh: experience.refresh,
      child: ListView(
        primary: false,
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
        children: [
          CustomerText(
            'HELLO, ${auth.profile?.displayName.split(' ').first.toUpperCase() ?? 'YOU'}',
            style: const TextStyle(
              fontSize: 10,
              letterSpacing: 2,
              fontWeight: FontWeight.w600,
              color: CustomerColors.muted,
            ),
          ),
          const SizedBox(height: 12),
          CustomerText(
            'Style, with\nyou in mind.',
            style: Theme.of(context).textTheme.displayLarge,
          ),
          const SizedBox(height: 14),
          const CustomerText(
            'Your personal space to discover a different look.',
            style: TextStyle(color: CustomerColors.muted, height: 1.5),
          ),
          const SizedBox(height: 24),
          if (experience.error != null) ...[
            CustomerNotice(experience.error!, error: true),
            TextButton(
              onPressed: experience.refresh,
              child: const CustomerText('Refresh Home'),
            ),
          ],
          if (experience.generating || experience.hasUncertainRequest) ...[
            CustomerNotice(
              experience.generating
                  ? 'Your look is being created. Open your fitting room to see its progress.'
                  : 'Check your last request before starting a new Try-On.',
            ),
            const SizedBox(height: 16),
          ],
          ClipRRect(
            borderRadius: BorderRadius.circular(30),
            child: SizedBox(
              height: 440,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.asset(
                    'assets/editorial/style-muse.webp',
                    fit: BoxFit.cover,
                    alignment: const Alignment(0, -.4),
                    excludeFromSemantics: true,
                  ),
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.center,
                        end: Alignment.bottomCenter,
                        colors: [Colors.transparent, Color(0xD924211F)],
                      ),
                    ),
                  ),
                  Positioned(
                    left: 22,
                    right: 22,
                    bottom: 22,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const CustomerText(
                          'A NEW POSSIBILITY',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            letterSpacing: 2,
                          ),
                        ),
                        const SizedBox(height: 8),
                        CustomerText(
                          'Something new.\nStill entirely you.',
                          style: Theme.of(context).textTheme.headlineLarge
                              ?.copyWith(color: Colors.white, fontSize: 32),
                        ),
                        const SizedBox(height: 18),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: busy ? null : studio,
                            icon: const Icon(
                              Icons.auto_awesome_outlined,
                              size: 18,
                            ),
                            label: CustomerText(
                              experience.generating ||
                                      experience.hasUncertainRequest
                                  ? 'Open current Try-On'
                                  : 'Explore Try-On',
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 22),
          const CustomerText(
            'YOUR OWN STARTING POINT',
            style: TextStyle(
              fontSize: 10,
              letterSpacing: 1.8,
              color: CustomerColors.muted,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _ActionTile(
                  icon: Icons.add_photo_alternate_outlined,
                  title: 'Your outfit',
                  description: 'Bring your inspiration',
                  onTap: studio,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: _ActionTile(
                  icon: Icons.person_outline_rounded,
                  title: 'My photo',
                  description: 'Make it personal',
                  onTap: studio,
                ),
              ),
            ],
          ),
          const SizedBox(height: 22),
          PremiumPanel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(
                  Icons.qr_code_rounded,
                  color: CustomerColors.orange,
                  size: 30,
                ),
                const SizedBox(height: 10),
                CustomerText(
                  'Discover it in Store.',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                const CustomerText(
                  'Scan its QR from the button above. Choose a Store product and let the Store sponsor your Try-On.',
                  style: TextStyle(color: CustomerColors.muted, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget account(BuildContext context) => ListView(
    primary: false,
    padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
    children: [
      CustomerText(
        'A space that’s yours.',
        style: Theme.of(context).textTheme.headlineLarge,
      ),
      const SizedBox(height: 24),
      Row(
        children: [
          CircleAvatar(
            radius: 31,
            backgroundColor: CustomerColors.tint,
            child: Text(
              (auth.profile?.displayName.isNotEmpty ?? false)
                  ? auth.profile!.displayName.characters.first.toUpperCase()
                  : 'S',
              style: const TextStyle(fontSize: 24, color: CustomerColors.ink),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  auth.profile?.displayName ?? '',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 4),
                Text(
                  auth.profile?.email ?? '',
                  style: const TextStyle(
                    fontSize: 12,
                    color: CustomerColors.muted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      const SizedBox(height: 28),
      settingsGroup([
        settingsTile(Icons.person_outline_rounded, 'Profile', editProfile),
        settingsTile(
          Icons.phone_outlined,
          'Phone number',
          () => Navigator.push<void>(
            context,
            MaterialPageRoute(
              builder: (_) => CustomerCodeScreen(
                auth: auth,
                linkPhone: true,
                initialContact:
                    auth.profile?.phoneNumber ??
                    auth.profile?.pendingPhoneNumber,
              ),
            ),
          ),
          trailing: auth.profile?.phoneNumber,
        ),
        settingsTile(
          Icons.lock_outline_rounded,
          'Account security',
          () => Navigator.push<void>(
            context,
            MaterialPageRoute(
              builder: (_) => CustomerPasswordScreen(controller: auth),
            ),
          ),
        ),
        settingsTile(Icons.workspace_premium_outlined, 'Subscriptions', plans),
      ]),
      const SizedBox(height: 18),
      settingsGroup([
        settingsTile(
          Icons.language_rounded,
          'Language',
          () => Navigator.push<void>(
            context,
            MaterialPageRoute(
              builder: (_) => CustomerLanguageScreen(controller: auth),
            ),
          ),
          trailing: CustomerLanguage.find(auth.language).nativeName,
        ),
        settingsTile(
          Icons.notifications_none_rounded,
          'Notifications',
          notifications,
        ),
        settingsTile(
          Icons.system_update_outlined,
          'App updates',
          () => Navigator.push<void>(
            context,
            MaterialPageRoute(
              builder: (_) => CustomerUpdatesScreen(auth: auth),
            ),
          ),
        ),
      ]),
      const SizedBox(height: 18),
      settingsGroup([
        settingsTile(
          Icons.delete_sweep_outlined,
          'Delete my photos',
          erasePhotos,
          destructive: true,
        ),
        settingsTile(
          Icons.privacy_tip_outlined,
          'Privacy Policy',
          () => openCustomerPolicy(context, auth, 'privacy'),
        ),
        settingsTile(
          Icons.description_outlined,
          'Terms',
          () => openCustomerPolicy(context, auth, 'terms'),
        ),
        settingsTile(
          Icons.help_outline_rounded,
          'Contact us',
          () => Navigator.push<void>(
            context,
            MaterialPageRoute(
              builder: (_) => CustomerSupportScreen(auth: auth),
            ),
          ),
        ),
        settingsTile(
          Icons.auto_awesome_outlined,
          'About SelfX',
          () => unavailable(
            'A little more possibility',
            'SelfX brings personal and Store-sponsored Try-On together in one place. Customer app.',
          ),
        ),
        settingsTile(
          Icons.slideshow_outlined,
          'See the introduction',
          auth.replayOnboarding,
        ),
        settingsTile(
          Icons.article_outlined,
          'Licenses',
          () => showLicensePage(
            context: context,
            applicationName: 'SelfX',
            applicationVersion: '0.1.0',
          ),
        ),
      ]),
      const SizedBox(height: 18),
      settingsGroup([
        settingsTile(
          Icons.logout_rounded,
          'Sign out',
          () => run(() => auth.signOut()),
        ),
        settingsTile(
          Icons.devices_rounded,
          'Sign out on all devices',
          () => run(() => auth.signOut(all: true)),
        ),
        settingsTile(
          Icons.delete_outline_rounded,
          'Delete account',
          deleteAccount,
          destructive: true,
        ),
      ]),
      const SizedBox(height: 24),
      const CustomerText(
        'Designed around you.',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 11,
          color: CustomerColors.muted,
          letterSpacing: .8,
        ),
      ),
    ],
  );
  Widget settingsGroup(List<Widget> children) => Material(
    color: Colors.white,
    clipBehavior: Clip.antiAlias,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(22),
      side: const BorderSide(color: CustomerColors.line),
    ),
    child: Column(children: children),
  );
  Widget settingsTile(
    IconData icon,
    String title,
    VoidCallback onTap, {
    String? trailing,
    bool destructive = false,
  }) => ListTile(
    contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 3),
    leading: Icon(
      icon,
      size: 22,
      color: destructive ? const Color(0xFF9A3025) : CustomerColors.muted,
    ),
    title: CustomerText(
      title,
      style: TextStyle(
        fontSize: 14,
        color: destructive ? const Color(0xFF9A3025) : CustomerColors.ink,
      ),
    ),
    trailing: trailing != null
        ? CustomerText(
            trailing,
            style: const TextStyle(fontSize: 12, color: CustomerColors.muted),
          )
        : const Icon(
            Icons.chevron_right_rounded,
            size: 19,
            color: CustomerColors.muted,
          ),
    enabled: !busy,
    onTap: onTap,
  );
  Future<void> openInformation(
    String title,
    String address,
    String fallback,
  ) async {
    final uri = Uri.tryParse(address);
    if (uri != null &&
        uri.scheme == 'https' &&
        uri.host.isNotEmpty &&
        uri.userInfo.isEmpty) {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    }
    if (mounted) await customerInfo(context, title, fallback);
  }

  Future<void> editProfile() async {
    final field = TextEditingController(text: auth.profile?.displayName ?? '');
    final result = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const CustomerText('Make it personal'),
        content: TextField(
          controller: field,
          maxLength: 160,
          decoration: InputDecoration(labelText: tr(context, 'Your name')),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const CustomerText('Cancel'),
          ),
          TextButton(
            onPressed: () {
              if (field.text.trim().isNotEmpty) {
                Navigator.pop(context, field.text.trim());
              }
            },
            child: const CustomerText('Save'),
          ),
        ],
      ),
    );
    field.dispose();
    if (result != null && mounted) {
      await run(() => auth.updateProfile(name: result));
    }
  }

  Future<void> deleteAccount() async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(builder: (_) => CustomerDeleteScreen(controller: auth)),
    );
  }
}

class _ActionTile extends StatelessWidget {
  final IconData icon;
  final String title, description;
  final VoidCallback onTap;
  const _ActionTile({
    required this.icon,
    required this.title,
    required this.description,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(22),
    child: InkWell(
      borderRadius: BorderRadius.circular(22),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: CustomerColors.line),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: CustomerColors.muted, size: 25),
            const SizedBox(height: 16),
            CustomerText(
              title,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 5),
            CustomerText(
              description,
              style: const TextStyle(
                fontSize: 11,
                color: CustomerColors.muted,
                height: 1.5,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class CustomerPasswordScreen extends StatefulWidget {
  final CustomerController controller;
  const CustomerPasswordScreen({super.key, required this.controller});
  @override
  State<CustomerPasswordScreen> createState() => _CustomerPasswordScreenState();
}

class _CustomerPasswordScreenState extends State<CustomerPasswordScreen> {
  final form = GlobalKey<FormState>(),
      code = TextEditingController(),
      password = TextEditingController();
  bool sent = false, busy = false;
  String? error, notice;
  Timer? resendTimer;
  int resendWait = 0;
  void startResendWait() {
    resendTimer?.cancel();
    resendWait = 60;
    resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        resendWait--;
        if (resendWait <= 0) timer.cancel();
      });
    });
  }

  @override
  void dispose() {
    code.dispose();
    password.dispose();
    resendTimer?.cancel();
    super.dispose();
  }

  Future<void> submit({bool resend = false}) async {
    if (busy ||
        (resend && resendWait > 0) ||
        (!resend && sent && !(form.currentState?.validate() ?? false))) {
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final email = widget.controller.profile!.email;
      if (!sent || resend) {
        final result = await widget.controller.api.request(
          '/auth/forgot-password',
          body: {'email': email},
        );
        if (mounted) {
          setState(() {
            sent = true;
            startResendWait();
            notice = result['message'] as String;
          });
        }
      } else {
        await widget.controller.api.request(
          '/auth/reset-password',
          body: {'email': email, 'code': code.text, 'password': password.text},
        );
        try {
          await widget.controller.signOut();
        } catch (_) {
          /* Reset already invalidated all sessions. */
        }
        if (mounted) Navigator.pop(context);
      }
    } catch (caught) {
      if (mounted) {
        setState(
          () => error = caught is CustomerApiException
              ? caught.message
              : 'Unable to change your password. Try again.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const CustomerText('Account security')),
    body: SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CustomerText(
              'A password\nthat’s only yours.',
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 16),
            CustomerText(
              'We’ll verify ${widget.controller.profile?.email ?? 'your email'} before changing your password. This signs you out on every device.',
              style: const TextStyle(color: CustomerColors.muted, height: 1.6),
            ),
            const SizedBox(height: 24),
            if (error != null) ...[
              CustomerNotice(error!, error: true),
              const SizedBox(height: 16),
            ],
            if (notice != null) ...[
              CustomerNotice(notice!),
              const SizedBox(height: 16),
            ],
            if (sent) ...[
              TextFormField(
                controller: code,
                inputFormatters: const [CustomerCodeFormatter()],
                textDirection: TextDirection.ltr,
                enabled: !busy,
                maxLength: 6,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: tr(context, '6-digit email code'),
                ),
                validator: (value) => RegExp(r'^\d{6}$').hasMatch(value ?? '')
                    ? null
                    : tr(context, 'Enter the 6-digit code.'),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: password,
                textDirection: TextDirection.ltr,
                enabled: !busy,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: tr(context, 'New password'),
                  helperText: trNullable(context, 'Use 8–128 characters.'),
                ),
                validator: (value) =>
                    (value?.length ?? 0) >= 8 && (value?.length ?? 0) <= 128
                    ? null
                    : tr(context, 'Use 8–128 characters.'),
              ),
              const SizedBox(height: 24),
            ],
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: busy ? null : submit,
                child: CustomerText(
                  busy
                      ? 'Please wait…'
                      : sent
                      ? 'Update password'
                      : 'Send verification code',
                ),
              ),
            ),
            if (sent)
              TextButton(
                onPressed: busy || resendWait > 0
                    ? null
                    : () => submit(resend: true),
                child: CustomerText(
                  resendWait > 0
                      ? 'Resend in ${resendWait}s'
                      : 'Send a new code',
                ),
              ),
          ],
        ),
      ),
    ),
  );
}

class CustomerDeleteScreen extends StatefulWidget {
  final CustomerController controller;
  const CustomerDeleteScreen({super.key, required this.controller});
  @override
  State<CustomerDeleteScreen> createState() => _CustomerDeleteScreenState();
}

class _CustomerDeleteScreenState extends State<CustomerDeleteScreen> {
  final confirmation = TextEditingController(),
      password = TextEditingController();
  bool busy = false;
  String? error;
  @override
  void dispose() {
    confirmation.dispose();
    password.dispose();
    super.dispose();
  }

  Future<void> remove({String? provider}) async {
    if (busy || confirmation.text != 'DELETE') {
      setState(() => error = 'Type DELETE to confirm.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.controller.deleteAccount(
        password: provider == null ? password.text : null,
        provider: provider,
      );
      if (mounted) Navigator.pop(context);
    } catch (caught) {
      if (mounted) {
        setState(
          () => error = caught is CustomerApiException
              ? caught.message
              : 'Account deletion could not be completed. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = widget.controller;
    return Scaffold(
      appBar: AppBar(title: const CustomerText('Delete account')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CustomerText(
              'A final goodbye?',
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 18),
            const CustomerText(
              'This deletes your profile and sign-in methods and ends your sessions on every device. You’ll need to create a new account to return.',
              style: TextStyle(color: CustomerColors.muted, height: 1.6),
            ),
            const SizedBox(height: 24),
            if (error != null) ...[
              CustomerNotice(error!, error: true),
              const SizedBox(height: 16),
            ],
            TextField(
              controller: confirmation,
              textDirection: TextDirection.ltr,
              enabled: !busy,
              decoration: InputDecoration(
                labelText: tr(context, 'Type DELETE to confirm'),
              ),
            ),
            const SizedBox(height: 20),
            if (auth.profile?.methods.contains('EMAIL_PASSWORD') ?? false) ...[
              TextField(
                controller: password,
                textDirection: TextDirection.ltr,
                enabled: !busy,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: tr(context, 'Current password'),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFA33528),
                    foregroundColor: Colors.white,
                  ),
                  onPressed: busy ? null : () => remove(),
                  child: const CustomerText('Permanently delete account'),
                ),
              ),
            ],
            if ((auth.profile?.methods.contains('GOOGLE') ?? false) &&
                auth.identity.googleAvailable)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: busy ? null : () => remove(provider: 'GOOGLE'),
                  child: const CustomerText('Verify with Google and delete'),
                ),
              ),
            if ((auth.profile?.methods.contains('APPLE') ?? false) &&
                auth.identity.appleAvailable)
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: busy ? null : () => remove(provider: 'APPLE'),
                  child: const CustomerText('Verify with Apple and delete'),
                ),
              ),
            const SizedBox(height: 18),
            const CustomerText(
              'You can also verify your email and set a password from Account security before deleting.',
              style: TextStyle(fontSize: 12, color: CustomerColors.muted),
            ),
          ],
        ),
      ),
    );
  }
}
