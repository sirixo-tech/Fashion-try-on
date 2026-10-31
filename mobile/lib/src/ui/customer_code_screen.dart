import 'dart:async';
import 'package:flutter/material.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import '../auth/customer_phone.dart';
import '../l10n/customer_copy.dart';
import 'customer_theme.dart';
import 'customer_phone_field.dart';
import 'customer_home_back.dart';

class CustomerCodeScreen extends StatefulWidget {
  final CustomerController auth;
  final bool linkPhone;
  final String? initialContact;
  const CustomerCodeScreen({
    super.key,
    required this.auth,
    this.linkPhone = false,
    this.initialContact,
  });
  @override
  State<CustomerCodeScreen> createState() => _CustomerCodeScreenState();
}

class _CustomerCodeScreenState extends State<CustomerCodeScreen> {
  final form = GlobalKey<FormState>();
  final phoneField = GlobalKey<CustomerPhoneFieldState>();
  final contact = TextEditingController(), code = TextEditingController();
  CustomerPhoneChallenge? challenge;
  String? proof, error, owner, diagnostic;
  String stage = 'SELFX_PREFLIGHT';
  bool busy = false, sent = false, consent = false;
  int cooldown = 0, guesses = 0;
  Timer? timer;
  bool get phone => !contact.text.contains('@');
  bool get phoneUnavailable =>
      phone &&
      (widget.linkPhone || contact.text.trim().isNotEmpty) &&
      !widget.auth.capabilities.phone;
  @override
  void initState() {
    super.initState();
    owner = widget.auth.profile?.id;
    contact.text = widget.initialContact ?? '';
  }

  @override
  void dispose() {
    timer?.cancel();
    widget.auth.phone.cancel();
    contact.dispose();
    code.dispose();
    super.dispose();
  }

  void startCooldown([int seconds = 10]) {
    timer?.cancel();
    cooldown = seconds.clamp(1, 86400);
    timer = Timer.periodic(const Duration(seconds: 1), (value) {
      if (!mounted) {
        value.cancel();
        return;
      }
      setState(() {
        cooldown--;
        if (cooldown <= 0) value.cancel();
      });
    });
  }

  Future<void> run(Future<void> Function() work) async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
      diagnostic = null;
    });
    try {
      await work();
    } on CustomerApiException catch (e) {
      if (mounted) {
        setState(() {
          error = e.status == 429
              ? 'Too many attempts. Please try again later.'
              : e.message;
          if (phone) {
            final safeCode = RegExp(r'^[A-Za-z0-9_-]{1,80}$').hasMatch(e.code)
                ? e.code
                : 'REQUEST_FAILED';
            diagnostic = e is CustomerPhoneException
                ? '${e.stage} / ${e.diagnosticCode}'
                : '$stage / $safeCode';
            if (e.status == 429) startCooldown(e.retryAfterSeconds ?? 10);
          }
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          error = 'We couldn’t complete that. Please try again.';
          if (phone) diagnostic = '$stage / REQUEST_FAILED';
        });
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> finish(String idToken) async {
    if (!mounted || (widget.linkPhone && widget.auth.profile?.id != owner)) {
      return;
    }
    stage = widget.linkPhone ? 'SELFX_LINK' : 'SELFX_LOGIN';
    await widget.auth.finishPhone(idToken, link: widget.linkPhone);
    if (mounted) Navigator.pop(context);
  }

  Future<void> send() async {
    if (cooldown > 0 || !(form.currentState?.validate() ?? false)) return;
    if (phone && !consent) {
      setState(() => error = 'Accept phone verification to continue.');
      return;
    }
    await run(() async {
      final value = phone
          ? phoneField.currentState!.canonical!
          : contact.text.trim();
      if (phone) {
        stage = 'SELFX_PREFLIGHT';
        if (!widget.auth.capabilities.phone) {
          await widget.auth.refreshCapabilities();
          if (!mounted ||
              (widget.linkPhone && widget.auth.profile?.id != owner)) {
            return;
          }
        }
        if (!widget.auth.capabilities.phone ||
            !await widget.auth.phone.configured()) {
          throw const CustomerApiException(
            'CUSTOMER_PHONE_UNAVAILABLE',
            'Phone sign-in is not configured yet.',
          );
        }
        final result = await widget.auth.api.request(
          '/auth/phone/request',
          body: {'phoneNumber': value},
        );
        if (!mounted) return;
        startCooldown((result['resendAfterSeconds'] as num?)?.toInt() ?? 10);
        stage = 'FIREBASE_REQUEST';
        final next = await widget.auth.phone.send(
          value,
          result['projectId'] as String,
        );
        if (!mounted) return;
        challenge = next;
        if (next.idToken != null) {
          await finish(next.idToken!);
          return;
        }
      } else {
        final result = await widget.auth.api.request(
          '/auth/email-code/request',
          body: {'email': value, if (proof != null) 'loginProof': proof},
        );
        if (!mounted) return;
        proof = result['loginProof'] as String;
      }
      if (mounted) {
        setState(() {
          sent = true;
          guesses = 0;
          code.clear();
          if (!phone) startCooldown(60);
        });
      }
    });
  }

  Future<void> verify() async {
    if (!RegExp(r'^\d{6}$').hasMatch(code.text)) {
      setState(() => error = 'Enter the correct 6-digit code.');
      return;
    }
    await run(() async {
      guesses++;
      if (phone) {
        stage = 'FIREBASE_VERIFY';
        final token = await widget.auth.phone.verify(challenge!, code.text);
        await finish(token);
      } else {
        await widget.auth.acceptCodeSession(
          () => widget.auth.api.request(
            '/auth/email-code/login',
            body: {
              'email': contact.text.trim(),
              'code': code.text,
              'loginProof': proof,
              'deviceName': 'SelfX mobile',
            },
          ),
        );
        if (mounted) Navigator.pop(context);
      }
    });
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !busy,
    child: Scaffold(
      appBar: AppBar(
        leading: widget.linkPhone
            ? (busy ? const SizedBox.shrink() : const CustomerHomeBackButton())
            : null,
        title: CustomerText(
          widget.linkPhone ? 'Phone number' : 'Sign in with a code',
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: CustomerBrand(),
                ),
                const SizedBox(height: 28),
                CustomerText(
                  widget.linkPhone
                      ? 'Verify your phone'
                      : 'Email or mobile number',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 16),
                if (error != null) ...[
                  CustomerText(
                    error!,
                    style: const TextStyle(color: Color(0xFF9A3025)),
                  ),
                  const SizedBox(height: 14),
                ],
                if (diagnostic != null) ...[
                  CustomerText(
                    'Verification error: $diagnostic',
                    style: const TextStyle(
                      fontSize: 12,
                      color: CustomerColors.muted,
                    ),
                  ),
                  const SizedBox(height: 14),
                ],
                CustomerPhoneField(
                  key: phoneField,
                  controller: contact,
                  countries: widget.auth.countries,
                  allowEmail: !widget.linkPhone,
                  enabled: !busy && !sent,
                  label: widget.linkPhone
                      ? 'Phone number'
                      : 'Email or mobile number',
                  onChanged: () => setState(() => consent = false),
                ),
                if (phoneUnavailable &&
                    error != 'Phone sign-in is not configured yet.')
                  const CustomerText('Phone sign-in is not configured yet.'),
                if (phone && contact.text.trim().isNotEmpty && !sent)
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: consent,
                    onChanged: busy
                        ? null
                        : (value) => setState(() => consent = value ?? false),
                    title: const CustomerText(
                      'I agree to receive a verification SMS. Google processes my number for authentication and abuse prevention. SMS charges may apply.',
                    ),
                  ),
                if (sent) ...[
                  const SizedBox(height: 12),
                  const CustomerText(
                    'Enter the 6-digit code. Email codes expire after 10 minutes. For SMS, request a new code if it has expired.',
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: code,
                    enabled: !busy && guesses < 5,
                    textDirection: TextDirection.ltr,
                    maxLength: 6,
                    keyboardType: TextInputType.number,
                    inputFormatters: const [CustomerCodeFormatter()],
                    autofillHints: const [AutofillHints.oneTimeCode],
                    decoration: InputDecoration(
                      counterText: '',
                      labelText: tr(context, '6-digit code'),
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  onPressed:
                      busy || (!sent && cooldown > 0) || (sent && guesses >= 5)
                      ? null
                      : sent
                      ? verify
                      : send,
                  child: busy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : CustomerText(
                          sent
                              ? 'Verify code'
                              : cooldown > 0
                              ? 'Resend in ${cooldown}s'
                              : 'Send code',
                        ),
                ),
                if (sent) ...[
                  TextButton(
                    onPressed: busy || cooldown > 0 ? null : send,
                    child: CustomerText(
                      cooldown > 0
                          ? 'Resend in ${cooldown}s'
                          : 'Send a new code',
                    ),
                  ),
                  TextButton(
                    onPressed: busy
                        ? null
                        : () => setState(() {
                            sent = false;
                            challenge = null;
                            proof = null;
                            code.clear();
                          }),
                    child: const CustomerText('Change email or phone'),
                  ),
                ],
                if (guesses >= 5)
                  const CustomerText('Too many attempts. Request a new code.'),
                if (!widget.linkPhone)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: TextButton(
                      onPressed: busy
                          ? null
                          : () => Navigator.pop(context, {
                              'createAccount': true,
                              'contact': contact.text.trim(),
                            }),
                      child: const CustomerText('Create an account'),
                    ),
                  ),
                if (widget.linkPhone)
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: CustomerText(
                      'Sign in again before changing your phone if your session is older than 10 minutes.',
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
