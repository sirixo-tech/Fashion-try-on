import 'package:flutter/material.dart';
import '../auth/customer_api.dart';
import '../auth/customer_controller.dart';
import 'customer_theme.dart';

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
  CustomerAuthView view = CustomerAuthView.signIn;
  bool obscure = true, accepted = false, busy = false;
  String? error, notice, signupProof;
  CustomerController get auth => widget.controller;
  bool get signup => view == CustomerAuthView.signUp;
  bool get credentialForm => view == CustomerAuthView.signIn || signup;
  void change(CustomerAuthView next) {
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
            password.clear();
            notice = result['message'] as String;
          });
        }
      } else if (signup) {
        final result = await auth.signUp(name.text, email.text, password.text);
        if (mounted) {
          setState(() {
            signupProof = result['signupProof'] as String;
            view = CustomerAuthView.verify;
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

  String? validateEmail(String? value) =>
      value == null ||
          !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value.trim())
      ? 'Enter a valid email address.'
      : null;
  String? validatePassword(String? value) {
    if (value == null || value.isEmpty) return 'Enter your password.';
    if (view != CustomerAuthView.signIn && value.length < 12) {
      return 'Use at least 12 characters.';
    }
    if (value.length > 128) return 'Use 128 characters or fewer.';
    return null;
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    name.dispose();
    code.dispose();
    super.dispose();
  }

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
        'Enter the 8-digit code sent to your email. It expires after 10 minutes.',
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
                          if (!credentialForm)
                            IconButton(
                              tooltip: 'Back to sign in',
                              onPressed: busy
                                  ? null
                                  : () => change(CustomerAuthView.signIn),
                              icon: const Icon(Icons.close_rounded),
                            ),
                        ],
                      ),
                      const SizedBox(height: 44),
                      Text(
                        title,
                        style: Theme.of(context).textTheme.headlineLarge,
                      ),
                      const SizedBox(height: 14),
                      Text(
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
                            label: const Text('Continue with Google'),
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
                            label: const Text('Continue with Apple'),
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
                              Padding(
                                padding: EdgeInsets.symmetric(horizontal: 16),
                                child: Text(
                                  'or use email',
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: CustomerColors.muted,
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
                          decoration: const InputDecoration(
                            labelText: 'Your name',
                            counterText: '',
                          ),
                          maxLength: 160,
                          textCapitalization: TextCapitalization.words,
                          autofillHints: const [AutofillHints.name],
                          validator: (value) =>
                              value == null || value.trim().isEmpty
                              ? 'Enter your name.'
                              : null,
                        ),
                        const SizedBox(height: 14),
                      ],
                      TextFormField(
                        controller: email,
                        enabled: !busy && view != CustomerAuthView.verify,
                        decoration: const InputDecoration(
                          labelText: 'Email address',
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
                          enabled: !busy,
                          decoration: const InputDecoration(
                            labelText: '8-digit email code',
                            counterText: '',
                          ),
                          keyboardType: TextInputType.number,
                          autofillHints: const [AutofillHints.oneTimeCode],
                          maxLength: 8,
                          validator: (value) =>
                              value == null ||
                                  !RegExp(r'^\d{8}$').hasMatch(value.trim())
                              ? 'Enter the 8-digit code.'
                              : null,
                        ),
                      ],
                      if (credentialForm || view == CustomerAuthView.reset) ...[
                        const SizedBox(height: 14),
                        TextFormField(
                          controller: password,
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
                            labelText: view == CustomerAuthView.reset
                                ? 'New password'
                                : 'Password',
                            helperText: view != CustomerAuthView.signIn
                                ? 'At least 12 characters. A passphrase works well.'
                                : null,
                            suffixIcon: IconButton(
                              tooltip: obscure
                                  ? 'Show password'
                                  : 'Hide password',
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
                          alignment: Alignment.centerRight,
                          child: TextButton(
                            onPressed: busy
                                ? null
                                : () => change(CustomerAuthView.forgot),
                            child: const Text('Forgot password?'),
                          ),
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
                          title: const Text(
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
                                address: const String.fromEnvironment(
                                  'SELFX_TERMS_URL',
                                ),
                              ),
                              child: const Text('Read Terms'),
                            ),
                            TextButton(
                              onPressed: () => customerInfo(
                                context,
                                'Privacy',
                                'Your account is separate from Store administration. Mobile Try-On results will be retained for 30 days. Original person photos keep the shorter approved retention period. You can delete your account from Me.',
                                address: const String.fromEnvironment(
                                  'SELFX_PRIVACY_URL',
                                ),
                              ),
                              child: const Text('Privacy Policy'),
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
                              : Text(button),
                        ),
                      ),
                      if (view == CustomerAuthView.verify)
                        TextButton(
                          onPressed: busy
                              ? null
                              : () => run(() async {
                                  final result = await auth.api.request(
                                    '/auth/resend-verification',
                                    body: {
                                      'email': email.text.trim(),
                                      'signupProof': signupProof,
                                    },
                                  );
                                  if (mounted) {
                                    setState(
                                      () =>
                                          notice = result['message'] as String,
                                    );
                                  }
                                }),
                          child: const Text('Send a new code'),
                        ),
                      const SizedBox(height: 20),
                      if (credentialForm)
                        Center(
                          child: Wrap(
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(
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
                                child: Text(
                                  signup ? 'Sign in' : 'Create an account',
                                ),
                              ),
                            ],
                          ),
                        ),
                      if (view == CustomerAuthView.signIn)
                        const Center(
                          child: Text(
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
