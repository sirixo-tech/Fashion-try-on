import 'package:flutter/material.dart';
import '../auth/customer_api.dart';
import '../experience/customer_content_reports.dart';
import '../experience/customer_experience.dart';
import '../l10n/customer_copy.dart';
import 'customer_theme.dart';

class CustomerReportButton extends StatelessWidget {
  final CustomerExperience experience;
  final CustomerPhoto result;
  final bool disabled, dark;
  const CustomerReportButton({
    super.key,
    required this.experience,
    required this.result,
    this.disabled = false,
    this.dark = false,
  });

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    onPressed: disabled
        ? null
        : () => showCustomerContentReport(context, experience, result),
    style: dark
        ? OutlinedButton.styleFrom(
            foregroundColor: Colors.white,
            backgroundColor: const Color(0xFF202329),
            side: const BorderSide(color: Color(0xFFE7D4C7), width: 1.2),
            minimumSize: const Size(48, 56),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            textStyle: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
            ),
          )
        : null,
    icon: const Icon(Icons.outlined_flag_rounded, size: 20),
    label: const CustomerText('Report'),
  );
}

/// Matches the result reference while allowing labels to wrap on small screens.
class CustomerResultActions extends StatelessWidget {
  final CustomerExperience experience;
  final CustomerPhoto result;
  final VoidCallback? onNewTryOn;
  const CustomerResultActions({
    super.key,
    required this.experience,
    required this.result,
    required this.onNewTryOn,
  });

  @override
  Widget build(BuildContext context) => LayoutBuilder(
    builder: (context, size) {
      final primary = FilledButton.icon(
        onPressed: onNewTryOn,
        icon: const Icon(Icons.auto_awesome_rounded),
        label: const CustomerText('New Try-On'),
      );
      final report = CustomerReportButton(
        experience: experience,
        result: result,
        dark: true,
        disabled: onNewTryOn == null,
      );
      if (size.maxWidth < 300 ||
          MediaQuery.textScalerOf(context).scale(16) > 21) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [primary, const SizedBox(height: 8), report],
        );
      }
      return Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(child: primary),
          const SizedBox(width: 10),
          SizedBox(width: (size.maxWidth * .28).clamp(104, 160), child: report),
        ],
      );
    },
  );
}

Future<void> showCustomerContentReport(
  BuildContext context,
  CustomerExperience experience,
  CustomerPhoto result,
) => showModalBottomSheet<void>(
  context: context,
  useSafeArea: true,
  isScrollControlled: true,
  isDismissible: false,
  enableDrag: false,
  showDragHandle: true,
  backgroundColor: CustomerColors.canvas,
  constraints: BoxConstraints(
    maxHeight: MediaQuery.sizeOf(context).height * .9,
  ),
  builder: (_) => _ContentReportForm(experience: experience, result: result),
);

class _ContentReportForm extends StatefulWidget {
  final CustomerExperience experience;
  final CustomerPhoto result;
  const _ContentReportForm({required this.experience, required this.result});
  @override
  State<_ContentReportForm> createState() => _ContentReportFormState();
}

class _ContentReportFormState extends State<_ContentReportForm> {
  final comment = TextEditingController();
  final form = GlobalKey<FormState>();
  CustomerReportReason? reason;
  bool sending = false;
  String? error, confirmation;

  @override
  void dispose() {
    comment.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    if (sending || reason == null || !form.currentState!.validate()) return;
    setState(() {
      sending = true;
      error = null;
    });
    try {
      await submitCustomerContentReport(
        widget.experience.auth,
        resultAssetId: widget.result.id,
        reason: reason!,
        comment: comment.text,
      );
      if (mounted) {
        setState(
          () => confirmation =
              'Report submitted. Thank you for helping keep SelfX safe.',
        );
      }
    } on CustomerApiException catch (caught) {
      if (!mounted) return;
      if (caught.code == 'CONTENT_REPORT_ALREADY_SUBMITTED') {
        setState(() => confirmation = 'You have already reported this image.');
      } else {
        setState(() => error = customerReportError(caught));
      }
    } catch (caught) {
      if (mounted) setState(() => error = customerReportError(caught));
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !sending,
    child: Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
          child: Form(
            key: form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                CustomerText(
                  'Report this image',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                if (confirmation != null) ...[
                  Semantics(
                    liveRegion: true,
                    child: CustomerText(confirmation!),
                  ),
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: () => Navigator.pop(context),
                    child: const CustomerText('Done'),
                  ),
                ] else ...[
                  const CustomerText(
                    'Report offensive or unsafe AI-generated content to SelfX.',
                  ),
                  const SizedBox(height: 20),
                  DropdownButtonFormField<CustomerReportReason>(
                    isExpanded: true,
                    isDense: false,
                    itemHeight: null,
                    // Menu padding must not constrain the closed field's text.
                    // Only the selected label contributes to the field height.
                    selectedItemBuilder: (context) => [
                      for (final item in CustomerReportReason.values)
                        if (item == reason)
                          CustomerText(item.label)
                        else
                          const SizedBox.shrink(),
                    ],
                    decoration: InputDecoration(
                      labelText: tr(context, 'Reason'),
                    ),
                    hint: const CustomerText('Select a reason'),
                    items: [
                      for (final item in CustomerReportReason.values)
                        DropdownMenuItem(
                          value: item,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: CustomerText(item.label),
                          ),
                        ),
                    ],
                    onChanged: sending
                        ? null
                        : (value) => setState(() => reason = value),
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: comment,
                    enabled: !sending,
                    maxLength: 2000,
                    minLines: 2,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(
                      labelText: tr(context, 'Comment (optional)'),
                    ),
                    validator: (value) =>
                        (value ?? '').trim().runes.length > 2000
                        ? tr(
                            context,
                            'Keep your comment within 2,000 characters.',
                          )
                        : null,
                  ),
                  if (error != null) ...[
                    CustomerNotice(error!, error: true),
                    const SizedBox(height: 12),
                  ],
                  const SizedBox(height: 8),
                  FilledButton(
                    onPressed: sending || reason == null ? null : submit,
                    child: CustomerText(
                      sending ? 'Submitting…' : 'Submit report',
                    ),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(48, 56),
                    ),
                    onPressed: sending ? null : () => Navigator.pop(context),
                    child: const CustomerText('Cancel'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
