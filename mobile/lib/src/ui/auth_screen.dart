import 'dart:async';
import '../l10n/customer_copy.dart';
import 'package:flutter/material.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import 'customer_theme.dart';
import 'customer_entry_theme.dart';
import 'customer_phone_field.dart';
import 'customer_policy_notice.dart';
import '../l10n/customer_language_screen.dart';

enum CustomerAuthView { signIn, signUp, verify, forgot, reset }

class CustomerAuthScreen extends StatefulWidget {
  final CustomerController controller;
  const CustomerAuthScreen({super.key, required this.controller});
  @override
  State<CustomerAuthScreen> createState() => _CustomerAuthScreenState();
}

class _CustomerAuthScreenState extends State<CustomerAuthScreen> {
  final scroll = ScrollController();
  final form = GlobalKey<FormState>();
  final email = TextEditingController(),
      password = TextEditingController(),
      name = TextEditingController(),
      code = TextEditingController();
  final verificationEmail = TextEditingController();
  final identifierField = GlobalKey<CustomerPhoneFieldState>();
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

  CustomerAuthView view = CustomerAuthView.signIn;
  bool obscure = true, busy = false, acceptedPolicy = false;
  String? error, notice, signupProof;
  CustomerController get auth => widget.controller;
  bool get signup => view == CustomerAuthView.signUp;
  bool get credentialForm => view == CustomerAuthView.signIn || signup;
  bool get numberSignup =>
      signup && email.text.trim().isNotEmpty && !email.text.contains('@');
  String get identifier => email.text.contains('@')
      ? email.text.trim()
      : identifierField.currentState?.canonical ?? email.text.trim();
  void change(CustomerAuthView next) {
    FocusScope.of(context).unfocus();
    resendTimer?.cancel();
    resendWait = 0;
    setState(() {
      view = next;
      error = null;
      notice = null;
      password.clear();
      code.clear();
      obscure = true;
      form.currentState?.reset();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && scroll.hasClients) {
        FocusScope.of(context).unfocus();
        scroll.jumpTo(0);
      }
    });
  }

  Future<void> run(Future<void> Function() action) async {
    if (busy) {
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      busy = true;
      error = null;
      notice = null;
    });
    try {
      await action();
    } on CustomerApiException catch (caught) {
      if (mounted) {
        setState(() {
          error = caught.code == 'OAUTH_CANCELLED' ? null : caught.message;
          if (caught.code == 'CUSTOMER_SIGNUP_REQUIRED') {
            view = CustomerAuthView.signUp;
          }
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => error = 'We couldn’t complete that. Please try again.');
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> submit() async {
    if (credentialForm && !ensurePolicy()) return;
    if (!(form.currentState?.validate() ?? false)) return;
    await run(() async {
      if (view == CustomerAuthView.signIn) {
        final result = await auth.signIn(identifier, password.text);
        if (mounted && result['verificationRequired'] == true) {
          setState(() {
            signupProof = result['signupProof'] as String;
            email.text = result['email'] as String? ?? email.text;
            view = CustomerAuthView.verify;
            startResendWait();
            password.clear();
            notice = result['message'] as String;
          });
        }
      } else if (signup) {
        final address = numberSignup ? verificationEmail.text : email.text;
        final mobile = numberSignup ? identifier : null;
        final result = await auth.signUp(
          name.text,
          address,
          password.text,
          phoneNumber: mobile,
        );
        if (mounted) {
          setState(() {
            email.text = address.trim();
            signupProof = result['signupProof'] as String;
            view = CustomerAuthView.verify;
            startResendWait();
            password.clear();
            notice = result['message'] as String;
          });
        }
      } else if (view == CustomerAuthView.verify) {
        final result = await auth.api.request(
          '/auth/verify-email',
          body: {
            'email': email.text.trim(),
            'code': code.text.trim(),
            'signupProof': signupProof,
          },
        );
        if (mounted) {
          change(CustomerAuthView.signIn);
          setState(() => notice = result['message'] as String);
        }
      } else if (view == CustomerAuthView.forgot) {
        final result = await auth.api.request(
          '/auth/forgot-password',
          body: {'email': email.text.trim()},
        );
        if (mounted) {
          setState(() {
            view = CustomerAuthView.reset;
            startResendWait();
            notice = result['message'] as String;
          });
        }
      } else {
        final result = await auth.api.request(
          '/auth/reset-password',
          body: {
            'email': email.text.trim(),
            'code': code.text.trim(),
            'password': password.text,
          },
        );
        if (mounted) {
          change(CustomerAuthView.signIn);
          setState(() => notice = result['message'] as String);
        }
      }
    });
  }

  Future<void> oauth(String provider) async {
    if (!ensurePolicy()) return;
    await run(() async {
      if (provider == 'GOOGLE' && !auth.capabilities.google) {
        await auth.refreshCapabilities();
        if (!auth.capabilities.google) {
          throw const CustomerApiException(
            'OAUTH_UNAVAILABLE',
            'Google sign-in could not be completed.',
          );
        }
      }
      await auth.oauth(provider, signup: true);
    });
  }

  bool ensurePolicy() {
    if (acceptedPolicy) return true;
    setState(
      () => error = tr(
        context,
        'Please read and accept the Terms and Privacy Policy.',
      ),
    );
    return false;
  }

  String? validateEmail(String? value) =>
      value == null ||
          !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value.trim())
      ? tr(context, 'Enter a valid email address.')
      : null;
  String? validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return tr(context, 'Enter your password.');
    }
    if (view != CustomerAuthView.signIn && value.length < 8) {
      return tr(context, 'Use at least 8 characters.');
    }
    if (value.length > 128) return tr(context, 'Use 128 characters or fewer.');
    return null;
  }

  @override
  void dispose() {
    scroll.dispose();
    email.dispose();
    password.dispose();
    name.dispose();
    code.dispose();
    verificationEmail.dispose();
    resendTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final compact = view == CustomerAuthView.signIn;
    final title = switch (view) {
      CustomerAuthView.signIn => 'Sign in',
      CustomerAuthView.signUp => 'A little more you.\nA world of style.',
      CustomerAuthView.verify => 'Check your inbox.',
      CustomerAuthView.forgot => 'Let’s get you\nback in.',
      CustomerAuthView.reset => 'A fresh start.',
    };
    final subtitle = switch (view) {
      CustomerAuthView.signIn => 'Sign in to your personal fitting room.',
      CustomerAuthView.signUp =>
        'Create your own space to explore, try and save.',
      CustomerAuthView.verify =>
        'Enter the 6-digit code sent to your email. It expires after 10 minutes.',
      CustomerAuthView.forgot =>
        'Enter your email and we’ll send a reset code.',
      CustomerAuthView.reset =>
        'Enter your email code and choose a new password.',
    };
    final button = switch (view) {
      CustomerAuthView.signIn => 'Sign in',
      CustomerAuthView.signUp => 'Create account',
      CustomerAuthView.verify => 'Verify email',
      CustomerAuthView.forgot => 'Send reset code',
      CustomerAuthView.reset => 'Reset password',
    };
    final entryTheme = customerEntryTheme(context);
    return Theme(
      data: entryTheme,
      child: Scaffold(
        backgroundColor: const Color(0xFFF1F5F5),
        body: SafeArea(
          child: LayoutBuilder(
            builder: (context, viewport) => Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: SingleChildScrollView(
                  controller: scroll,
                  padding: EdgeInsets.fromLTRB(24, compact ? 4 : 20, 24, 20),
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: compact ? viewport.maxHeight - 24 : 0,
                    ),
                    child: AutofillGroup(
                      child: Form(
                        key: form,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: compact
                              ? MainAxisAlignment.center
                              : MainAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                if (!credentialForm)
                                  IconButton(
                                    tooltip: tr(context, 'Back to sign in'),
                                    onPressed: busy
                                        ? null
                                        : () => change(CustomerAuthView.signIn),
                                    icon: const Icon(Icons.arrow_back_rounded),
                                  )
                                else
                                  const SizedBox(width: 48),
                                Expanded(
                                  child: Center(
                                    child: CustomerBrand(compact: compact),
                                  ),
                                ),
                                IconButton(
                                  tooltip: tr(context, 'Language'),
                                  onPressed: busy
                                      ? null
                                      : () => Navigator.push<void>(
                                          context,
                                          MaterialPageRoute(
                                            builder: (_) =>
                                                CustomerLanguageScreen(
                                                  controller: widget.controller,
                                                ),
                                          ),
                                        ),
                                  icon: const Icon(Icons.language),
                                ),
                              ],
                            ),
                            SizedBox(height: compact ? 12 : 32),
                            Align(
                              alignment: compact
                                  ? Alignment.center
                                  : AlignmentDirectional.centerStart,
                              child: CustomerText(
                                title,
                                textAlign: compact ? TextAlign.center : null,
                                style: compact
                                    ? entryTheme.textTheme.headlineMedium
                                          ?.copyWith(fontSize: 25, height: 1.1)
                                    : entryTheme.textTheme.headlineLarge,
                              ),
                            ),
                            SizedBox(height: compact ? 5 : 12),
                            Align(
                              alignment: compact
                                  ? Alignment.center
                                  : AlignmentDirectional.centerStart,
                              child: CustomerText(
                                subtitle,
                                textAlign: compact ? TextAlign.center : null,
                                style: Theme.of(context).textTheme.bodyLarge
                                    ?.copyWith(
                                      color: CustomerColors.muted,
                                      fontSize: compact ? 14 : null,
                                      height: compact ? 1.3 : null,
                                    ),
                              ),
                            ),
                            SizedBox(height: compact ? 16 : 24),
                            if (error != null) ...[
                              CustomerNotice(error!, error: true),
                              const SizedBox(height: 16),
                            ],
                            if (notice != null) ...[
                              CustomerNotice(notice!),
                              const SizedBox(height: 16),
                            ],
                            if (!auth.capabilities.enabled) ...[
                              const CustomerNotice(
                                'Customer sign-in is not available yet. Please try again later.',
                              ),
                              const SizedBox(height: 16),
                            ],
                            if (credentialForm &&
                                auth.identity.googleAvailable) ...[
                              SizedBox(
                                width: double.infinity,
                                child: OutlinedButton.icon(
                                  onPressed: busy
                                      ? null
                                      : () => oauth('GOOGLE'),
                                  icon: Image.asset(
                                    'assets/branding/google-g.png',
                                    width: 20,
                                    height: 20,
                                    fit: BoxFit.contain,
                                    excludeFromSemantics: true,
                                  ),
                                  label: const CustomerText(
                                    'Continue with Google',
                                  ),
                                ),
                              ),
                              SizedBox(height: compact ? 6 : 12),
                            ],
                            if (credentialForm &&
                                auth.capabilities.apple &&
                                auth.identity.appleAvailable) ...[
                              SizedBox(
                                width: double.infinity,
                                child: OutlinedButton.icon(
                                  onPressed: busy ? null : () => oauth('APPLE'),
                                  icon: const Icon(
                                    Icons.apple_rounded,
                                    size: 23,
                                  ),
                                  label: const CustomerText(
                                    'Continue with Apple',
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                            ],
                            if (credentialForm &&
                                (auth.identity.googleAvailable ||
                                    (auth.capabilities.apple &&
                                        auth.identity.appleAvailable))) ...[
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 7,
                                ),
                                child: Row(
                                  children: [
                                    const Expanded(child: Divider()),
                                    Flexible(
                                      flex: 4,
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 16,
                                        ),
                                        child: CustomerText(
                                          compact
                                              ? 'Email or mobile number'
                                              : 'or use email',
                                          textAlign: TextAlign.center,
                                          style: const TextStyle(
                                            fontSize: 12,
                                            color: CustomerColors.muted,
                                          ),
                                        ),
                                      ),
                                    ),
                                    const Expanded(child: Divider()),
                                  ],
                                ),
                              ),
                              if (!compact) const SizedBox(height: 8),
                            ],
                            if (signup) ...[
                              TextFormField(
                                controller: name,
                                enabled: !busy,
                                decoration: InputDecoration(
                                  labelText: tr(context, 'Your name'),
                                  counterText: '',
                                ),
                                maxLength: 160,
                                textCapitalization: TextCapitalization.words,
                                autofillHints: const [AutofillHints.name],
                                validator: (value) =>
                                    value == null || value.trim().isEmpty
                                    ? tr(context, 'Enter your name.')
                                    : null,
                              ),
                              const SizedBox(height: 14),
                            ],
                            if (credentialForm)
                              CustomerPhoneField(
                                key: identifierField,
                                controller: email,
                                countries: auth.countries,
                                label: 'Email or mobile number',
                                allowEmail: true,
                                compact: compact,
                                enabled: !busy,
                                onChanged: () => setState(() {}),
                              )
                            else
                              TextFormField(
                                controller: email,
                                textDirection: TextDirection.ltr,
                                enabled:
                                    !busy && view != CustomerAuthView.verify,
                                decoration: InputDecoration(
                                  labelText: tr(context, 'Email address'),
                                  counterText: '',
                                ),
                                keyboardType: TextInputType.emailAddress,
                                textInputAction: TextInputAction.next,
                                autocorrect: false,
                                autofillHints: const [AutofillHints.email],
                                maxLength: 320,
                                validator: validateEmail,
                              ),
                            if (view == CustomerAuthView.verify ||
                                view == CustomerAuthView.reset) ...[
                              SizedBox(height: compact ? 6 : 14),
                              TextFormField(
                                controller: code,
                                inputFormatters: const [
                                  CustomerCodeFormatter(),
                                ],
                                textDirection: TextDirection.ltr,
                                enabled: !busy,
                                decoration: InputDecoration(
                                  labelText: tr(context, '6-digit email code'),
                                  counterText: '',
                                ),
                                keyboardType: TextInputType.number,
                                autofillHints: const [
                                  AutofillHints.oneTimeCode,
                                ],
                                maxLength: 6,
                                validator: (value) =>
                                    value == null ||
                                        !RegExp(
                                          r'^\d{6}$',
                                        ).hasMatch(value.trim())
                                    ? tr(context, 'Enter the 6-digit code.')
                                    : null,
                              ),
                            ],
                            if (credentialForm ||
                                view == CustomerAuthView.reset) ...[
                              SizedBox(height: compact ? 6 : 14),
                              TextFormField(
                                controller: password,
                                textDirection: TextDirection.ltr,
                                enabled: !busy,
                                obscureText: obscure,
                                enableSuggestions: false,
                                autocorrect: false,
                                autofillHints: [
                                  signup || view == CustomerAuthView.reset
                                      ? AutofillHints.newPassword
                                      : AutofillHints.password,
                                ],
                                decoration: InputDecoration(
                                  labelText: tr(
                                    context,
                                    view == CustomerAuthView.reset
                                        ? 'New password'
                                        : 'Password',
                                  ),
                                  helperText: trNullable(
                                    context,
                                    view != CustomerAuthView.signIn
                                        ? 'At least 8 characters. A passphrase works well.'
                                        : null,
                                  ),
                                  suffixIcon: IconButton(
                                    tooltip: tr(
                                      context,
                                      obscure
                                          ? 'Show password'
                                          : 'Hide password',
                                    ),
                                    onPressed: () =>
                                        setState(() => obscure = !obscure),
                                    icon: Icon(
                                      obscure
                                          ? Icons.visibility_outlined
                                          : Icons.visibility_off_outlined,
                                    ),
                                  ),
                                ),
                                validator: validatePassword,
                                onFieldSubmitted: (_) {
                                  if (!busy) submit();
                                },
                              ),
                            ],
                            if (view == CustomerAuthView.signIn)
                              Align(
                                alignment: AlignmentDirectional.centerEnd,
                                child: TextButton(
                                  onPressed: busy
                                      ? null
                                      : () => change(CustomerAuthView.forgot),
                                  child: const CustomerText('Forgot password?'),
                                ),
                              ),
                            if (numberSignup) ...[
                              const SizedBox(height: 14),
                              TextFormField(
                                key: const ValueKey(
                                  'signup-verification-email',
                                ),
                                controller: verificationEmail,
                                decoration: InputDecoration(
                                  labelText: tr(context, 'Email address'),
                                  helperText: tr(
                                    context,
                                    'Your verification code will be sent to this email.',
                                  ),
                                  helperMaxLines: 3,
                                ),
                                keyboardType: TextInputType.emailAddress,
                                textDirection: TextDirection.ltr,
                                autofillHints: const [AutofillHints.email],
                                validator: validateEmail,
                                maxLength: 320,
                                enabled: !busy,
                              ),
                            ],
                            if (credentialForm) ...[
                              Center(
                                child: ConstrainedBox(
                                  constraints: const BoxConstraints(
                                    maxWidth: 300,
                                  ),
                                  child: CustomerPolicyNotice(
                                    accepted: acceptedPolicy,
                                    onChanged: busy
                                        ? null
                                        : (value) => setState(
                                            () =>
                                                acceptedPolicy = value ?? false,
                                          ),
                                  ),
                                ),
                              ),
                              SizedBox(height: compact ? 10 : 20),
                            ] else
                              const SizedBox(height: 20),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton(
                                onPressed: busy || !auth.capabilities.enabled
                                    ? null
                                    : submit,
                                child: busy
                                    ? const SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : CustomerText(button),
                              ),
                            ),
                            if (view == CustomerAuthView.verify ||
                                view == CustomerAuthView.reset)
                              TextButton(
                                onPressed: busy || resendWait > 0
                                    ? null
                                    : () => run(() async {
                                        final result = await auth.api.request(
                                          view == CustomerAuthView.verify
                                              ? '/auth/resend-verification'
                                              : '/auth/forgot-password',
                                          body: {
                                            'email': email.text.trim(),
                                            if (view == CustomerAuthView.verify)
                                              'signupProof': signupProof,
                                          },
                                        );
                                        if (mounted) {
                                          startResendWait();
                                          setState(
                                            () => notice =
                                                result['message'] as String,
                                          );
                                        }
                                      }),
                                child: CustomerText(
                                  resendWait > 0
                                      ? 'Resend in ${resendWait}s'
                                      : 'Send a new code',
                                ),
                              ),
                            SizedBox(height: compact ? 4 : 20),
                            if (credentialForm)
                              Center(
                                child: Wrap(
                                  crossAxisAlignment: WrapCrossAlignment.center,
                                  children: [
                                    CustomerText(
                                      signup
                                          ? 'Already have an account?'
                                          : 'New to SelfX?',
                                      style: const TextStyle(
                                        color: CustomerColors.muted,
                                      ),
                                    ),
                                    TextButton(
                                      onPressed: busy
                                          ? null
                                          : () => change(
                                              signup
                                                  ? CustomerAuthView.signIn
                                                  : CustomerAuthView.signUp,
                                            ),
                                      child: CustomerText(
                                        signup
                                            ? 'Sign in'
                                            : 'Create an account',
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            if (view == CustomerAuthView.signIn)
                              const Center(
                                child: CustomerText(
                                  'Your style. Your space.',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: CustomerColors.muted,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
