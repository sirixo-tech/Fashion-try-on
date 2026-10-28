import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import '../l10n/customer_copy.dart';
import '../services/customer_public_links.dart';
import 'customer_theme.dart';

class CustomerPolicyNotice extends StatefulWidget {
  final bool accepted;
  final ValueChanged<bool?>? onChanged;
  const CustomerPolicyNotice({
    super.key,
    required this.accepted,
    required this.onChanged,
  });
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
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Checkbox(
          value: widget.accepted,
          onChanged: widget.onChanged,
          visualDensity: VisualDensity.compact,
          materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          activeColor: CustomerColors.orange,
          semanticLabel: tr(
            context,
            'I agree to the Terms and Privacy Policy.',
          ),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const CustomerText(
                'I agree to the Terms and Privacy Policy.',
                style: TextStyle(fontSize: 12, height: 1.25),
              ),
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: tr(context, 'Terms'),
                      style: link,
                      recognizer: terms,
                    ),
                    const TextSpan(text: '  ·  '),
                    TextSpan(
                      text: tr(context, 'Privacy Policy'),
                      style: link,
                      recognizer: privacy,
                    ),
                  ],
                ),
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.35,
                  color: CustomerColors.muted,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
