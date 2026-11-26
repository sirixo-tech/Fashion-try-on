import 'package:flutter/material.dart';
import '../l10n/customer_copy.dart';
import 'customer_theme.dart';

/// The same compact balance control in Home and Saved.
class CustomerCreditBadge extends StatelessWidget {
  final int? remaining;
  final VoidCallback onTap;
  final Key? buttonKey;
  const CustomerCreditBadge({
    super.key,
    required this.remaining,
    required this.onTap,
    this.buttonKey,
  });
  @override
  Widget build(BuildContext context) => Tooltip(
    message: tr(
      context,
      remaining == 0
          ? 'Add credits'
          : 'Personal free trial credits. Store-sponsored usage is separate.',
    ),
    child: Semantics(
      button: true,
      label: tr(
        context,
        remaining == 0
            ? 'Add credits'
            : 'Personal credits: ${remaining ?? 'unavailable'}',
      ),
      child: Material(
        color: CustomerColors.tint,
        borderRadius: BorderRadius.circular(24),
        child: InkWell(
          key: buttonKey,
          borderRadius: BorderRadius.circular(24),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  remaining == 0
                      ? Icons.add_rounded
                      : Icons.auto_awesome_rounded,
                  color: CustomerColors.orange,
                  size: 17,
                ),
                const SizedBox(width: 5),
                if (remaining == 0)
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 66),
                    child: const FittedBox(
                      fit: BoxFit.scaleDown,
                      child: CustomerText(
                        'Add credits',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  )
                else
                  CustomerText(
                    remaining?.toString() ?? '—',
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
