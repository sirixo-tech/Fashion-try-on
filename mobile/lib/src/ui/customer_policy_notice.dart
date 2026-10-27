import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import '../l10n/customer_copy.dart';
import '../services/customer_public_links.dart';
import 'customer_theme.dart';

class CustomerPolicyNotice extends StatefulWidget {
  const CustomerPolicyNotice({super.key});
  @override
  State<CustomerPolicyNotice> createState() => _CustomerPolicyNoticeState();
}

class _CustomerPolicyNoticeState extends State<CustomerPolicyNotice> {
  final terms = TapGestureRecognizer(), privacy = TapGestureRecognizer();
  @override
  void dispose() {
    terms.dispose();
    privacy.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    terms.onTap = () => customerInfo(
      context,
      'Terms',
      'Your SelfX account is personal. Use only images you own or have permission to use.',
      address: CustomerPublicLinks.terms,
    );
    privacy.onTap = () => customerInfo(
      context,
      'Privacy',
      'You control your photos and account. Read the SelfX Privacy Policy for retention and deletion details.',
      address: CustomerPublicLinks.privacy,
    );
    const link = TextStyle(
      color: CustomerColors.ink,
      decoration: TextDecoration.underline,
      fontWeight: FontWeight.w600,
    );
    return Text.rich(
      TextSpan(
        children: [
          TextSpan(text: '${tr(context, 'By continuing, you agree to our')} '),
          TextSpan(text: tr(context, 'Terms'), style: link, recognizer: terms),
          const TextSpan(text: ' · '),
          TextSpan(
            text: tr(context, 'Privacy Policy'),
            style: link,
            recognizer: privacy,
          ),
        ],
      ),
      style: const TextStyle(
        fontSize: 13,
        height: 1.6,
        color: CustomerColors.muted,
      ),
    );
  }
}
