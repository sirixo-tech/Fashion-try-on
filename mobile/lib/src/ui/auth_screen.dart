import 'dart:async';
import '../l10n/customer_copy.dart';
import '../services/customer_public_links.dart';
import 'package:flutter/material.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import 'customer_theme.dart';
import 'customer_code_screen.dart';
import '../l10n/customer_language_screen.dart';

enum CustomerAuthView { signIn, signUp, verify, forgot, reset }

class CustomerAuthScreen extends StatefulWidget {
  final CustomerController controller;
  const CustomerAuthScreen({super.key, required this.controller});
  @override
  State<CustomerAuthScreen> createState() => _CustomerAuthScreenState();
}

class _CustomerAuthScreenState extends State<CustomerAuthScreen> {
  final form = GlobalKey<FormState>();
  final email = TextEditingController(),
      password = TextEditingController(),
      name = TextEditingController(),
      code = TextEditingController();
  final phone = TextEditingController(),
      country = TextEditingController(text: '+91');
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
  bool obscure = true, accepted = false, busy = false;
  String? error, notice, signupProof;
  CustomerController get auth => widget.controller;
  bool get signup => view == CustomerAuthView.signUp;
  bool get credentialForm => view == CustomerAuthView.signIn || signup;
  void change(CustomerAuthView next) {
    resendTimer?.cancel();
    resendWait = 0;
    setState(() {
      view = next;
      error = null;
      notice = null;
      password.clear();
      code.clear();
      accepted = false;
      obscure = true;
      form.currentState?.reset();
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
            accepted = false;
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
    if (!(form.currentState?.validate() ?? false)) return;
    if (signup && !accepted) {
      setState(
        () => error = 'Please read and accept the Terms and Privacy Policy.',
      );
      return;
    }
    await run(() async {
      if (view == CustomerAuthView.signIn) {
        final result = await auth.signIn(email.text, password.text);
        if (mounted && result['verificationRequired'] == true) {
          setState(() {
            signupProof = result['signupProof'] as String;
            view = CustomerAuthView.verify;
            startResendWait();
            password.clear();
            notice = result['message'] as String;
          });
        }
      } else if (signup) {
        final result = await auth.signUp(
          name.text,
          email.text,
          password.text,
          phoneNumber: phone.text.trim().isEmpty
              ? null
              : '${country.text.trim()}${phone.text.trim()}',
        );
        if (mounted) {
          setState(() {
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
    if (signup && !accepted) {
      setState(
        () => error = 'Please read and accept the Terms and Privacy Policy.',
      );
      return;
    }
    await run(() async {
      await auth.oauth(provider, signup: signup);
    });
  }

  Future<void> codeLogin() async {
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(
        builder: (_) =>
            CustomerCodeScreen(auth: auth, initialContact: email.text),
      ),
    );
    if (mounted && result?['createAccount'] == true) {
      final contact = result?['contact'] as String? ?? '';
      change(CustomerAuthView.signUp);
      email.text = contact.contains('@') ? contact : '';
    }
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
    email.dispose();
    password.dispose();
    name.dispose();
    code.dispose();
    phone.dispose();
    country.dispose();
    resendTimer?.cancel();
    super.dispose();
  }

  Widget contactField(
    String label,
    TextEditingController controller,
    FormFieldValidator<String> validator,
    int maximum,
  ) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 36),
        child: CustomerText(
          label,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ),
      Semantics(
        label: tr(context, label),
        child: TextFormField(
          controller: controller,
          enabled: !busy,
          textDirection: TextDirection.ltr,
          keyboardType: TextInputType.phone,
          inputFormatters: const [CustomerCodeFormatter()],
          maxLength: maximum,
          decoration: const InputDecoration(counterText: ''),
          validator: validator,
        ),
      ),
    ],
  );
  Widget phoneContacts() => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: contactField(
          'Country code',
          country,
          (value) =>
              phone.text.trim().isEmpty ||
                  RegExp(r'^\+[1-9]\d{0,2}$').hasMatch(value?.trim() ?? '')
              ? null
              : tr(context, 'Enter a valid country code.'),
          4,
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        flex: 2,
        child: contactField(
          'Phone number (optional)',
          phone,
          (value) =>
              (value?.trim().isEmpty ?? true) ||
                  RegExp(
                    r'^\+[1-9]\d{7,14}$',
                  ).hasMatch('${country.text.trim()}${value!.trim()}')
              ? null
              : tr(context, 'Enter a valid phone number with country code.'),
          14,
        ),
      ),
    ],
  );

  @override
  Widget build(BuildContext context) {
    final title = switch (view) {
      CustomerAuthView.signIn => 'Your next look\nstarts here.',
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
    return Scaffold(
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(28, 20, 28, 28),
              child: AutofillGroup(
                child: Form(
                  key: form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const CustomerBrand(),
                          const Spacer(),
                          IconButton(
                            tooltip: tr(context, 'Language'),
                            onPressed: busy
                                ? null
                                : () => Navigator.push<void>(
                                    context,
                                    MaterialPageRoute(
                                      builder: (_) => CustomerLanguageScreen(
                                        controller: widget.controller,
                                      ),
                                    ),
                                  ),
                            icon: const Icon(Icons.language),
                          ),
                          if (!credentialForm)
                            IconButton(
                              tooltip: tr(context, 'Back to sign in'),
                              onPressed: busy
                                  ? null
                                  : () => change(CustomerAuthView.signIn),
                              icon: const Icon(Icons.close_rounded),
                            ),
                        ],
                      ),
                      const SizedBox(height: 44),
                      CustomerText(
                        title,
                        style: Theme.of(context).textTheme.headlineLarge,
                      ),
                      const SizedBox(height: 14),
                      CustomerText(
                        subtitle,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: CustomerColors.muted,
                        ),
                      ),
                      const SizedBox(height: 32),
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
                          auth.capabilities.google &&
                          auth.identity.googleAvailable) ...[
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: busy ? null : () => oauth('GOOGLE'),
                            icon: const Icon(
                              Icons.g_mobiledata_rounded,
                              size: 28,
                            ),
                            label: const CustomerText('Continue with Google'),
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (credentialForm &&
                          auth.capabilities.apple &&
                          auth.identity.appleAvailable) ...[
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: busy ? null : () => oauth('APPLE'),
                            icon: const Icon(Icons.apple_rounded, size: 23),
                            label: const CustomerText('Continue with Apple'),
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      if (credentialForm &&
                          ((auth.capabilities.google &&
                                  auth.identity.googleAvailable) ||
                              (auth.capabilities.apple &&
                                  auth.identity.appleAvailable))) ...[
                        const Padding(
                          padding: EdgeInsets.symmetric(vertical: 14),
                          child: Row(
                            children: [
                              Expanded(child: Divider()),
                              Flexible(
                                flex: 4,
                                child: Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 16),
                                  child: CustomerText(
                                    'or use email',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: CustomerColors.muted,
                                    ),
                                  ),
                                ),
                              ),
                              Expanded(child: Divider()),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
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
                      TextFormField(
                        controller: email,
                        textDirection: TextDirection.ltr,
                        enabled: !busy && view != CustomerAuthView.verify,
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
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: code,
                          inputFormatters: const [CustomerCodeFormatter()],
                          textDirection: TextDirection.ltr,
                          enabled: !busy,
                          decoration: InputDecoration(
                            labelText: tr(context, '6-digit email code'),
                            counterText: '',
                          ),
                          keyboardType: TextInputType.number,
                          autofillHints: const [AutofillHints.oneTimeCode],
                          maxLength: 6,
                          validator: (value) =>
                              value == null ||
                                  !RegExp(r'^\d{6}$').hasMatch(value.trim())
                              ? tr(context, 'Enter the 6-digit code.')
                              : null,
                        ),
                      ],
                      if (credentialForm || view == CustomerAuthView.reset) ...[
                        const SizedBox(height: 14),
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
                                obscure ? 'Show password' : 'Hide password',
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
                      if (signup) ...[
                        const SizedBox(height: 14),
                        phoneContacts(),
                        const SizedBox(height: 8),
                        const CustomerText(
                          'Verify your phone in Account settings after signing in. Your email must be verified first.',
                        ),
                      ],
                      if (view == CustomerAuthView.signIn &&
                          (auth.capabilities.emailCode ||
                              auth.capabilities.phone))
                        TextButton(
                          onPressed: busy ? null : codeLogin,
                          child: const CustomerText('Sign in with a code'),
                        ),
                      if (signup) ...[
                        const SizedBox(height: 8),
                        CheckboxListTile(
                          contentPadding: EdgeInsets.zero,
                          controlAffinity: ListTileControlAffinity.leading,
                          value: accepted,
                          onChanged: busy
                              ? null
                              : (value) =>
                                    setState(() => accepted = value ?? false),
                          title: const CustomerText(
                            'I agree to the Terms and Privacy Policy.',
                            style: TextStyle(fontSize: 13),
                          ),
                          activeColor: CustomerColors.orange,
                        ),
                      ],
                      if (signup)
                        Wrap(
                          children: [
                            TextButton(
                              onPressed: () => customerInfo(
                                context,
                                'Terms',
                                'Your SelfX account is personal. Use only images you own or have permission to use. Personal Try-On and Store-sponsored sessions have separate allowances. Please respect other people’s privacy and use the service responsibly.',
                                address: CustomerPublicLinks.terms,
                              ),
                              child: const CustomerText('Read Terms'),
                            ),
                            TextButton(
                              onPressed: () => customerInfo(
                                context,
                                'Privacy',
                                'Your account is separate from Store administration. Mobile Try-On results will be retained for 30 days. Original person photos keep the shorter approved retention period. You can delete your account from Me.',
                                address: CustomerPublicLinks.privacy,
                              ),
                              child: const CustomerText('Privacy Policy'),
                            ),
                          ],
                        ),
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
                                    color: CustomerColors.ink,
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
                                      () =>
                                          notice = result['message'] as String,
                                    );
                                  }
                                }),
                          child: CustomerText(
                            resendWait > 0
                                ? 'Resend in ${resendWait}s'
                                : 'Send a new code',
                          ),
                        ),
                      const SizedBox(height: 20),
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
                                  signup ? 'Sign in' : 'Create an account',
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
    );
  }
}
