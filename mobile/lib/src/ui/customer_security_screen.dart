import 'dart:async';
import 'package:flutter/material.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import '../l10n/customer_copy.dart';
import 'customer_theme.dart';

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
