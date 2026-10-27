import 'package:flutter/material.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import '../l10n/customer_copy.dart';
import 'customer_theme.dart';

class CustomerProfileSheet extends StatefulWidget {
  final CustomerController auth;
  const CustomerProfileSheet({super.key, required this.auth});
  @override
  State<CustomerProfileSheet> createState() => _CustomerProfileSheetState();
}

class _CustomerProfileSheetState extends State<CustomerProfileSheet> {
  final form = GlobalKey<FormState>();
  late final name = TextEditingController(
    text: widget.auth.profile?.displayName ?? '',
  );
  late final owner = widget.auth.profile?.id;
  bool busy = false;
  String? error;
  @override
  void dispose() {
    name.dispose();
    super.dispose();
  }

  Future<void> save() async {
    if (busy || !(form.currentState?.validate() ?? false)) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (owner == null || widget.auth.profile?.id != owner) {
        throw const CustomerApiException(
          'CUSTOMER_UNAUTHORIZED',
          'Please sign in again.',
        );
      }
      await widget.auth.updateProfile(name: name.text.trim());
      if (mounted && widget.auth.profile?.id == owner) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(
          () => error = e is CustomerApiException
              ? e.message
              : 'We couldn’t complete that. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
      child: Form(
        key: form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            CustomerText(
              'Edit profile',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 20),
            if (error != null) ...[
              CustomerNotice(error!, error: true),
              const SizedBox(height: 16),
            ],
            TextFormField(
              controller: name,
              autofocus: true,
              enabled: !busy,
              maxLength: 160,
              textCapitalization: TextCapitalization.words,
              autofillHints: const [AutofillHints.name],
              textInputAction: TextInputAction.done,
              decoration: InputDecoration(
                labelText: tr(context, 'Your name'),
                counterText: '',
              ),
              validator: (value) => value == null || value.trim().isEmpty
                  ? tr(context, 'Enter your name.')
                  : null,
              onFieldSubmitted: (_) => save(),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: busy ? null : save,
              child: busy
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const CustomerText('Save changes'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: busy ? null : () => Navigator.pop(context),
              child: const CustomerText('Cancel'),
            ),
          ],
        ),
      ),
    ),
  );
}
