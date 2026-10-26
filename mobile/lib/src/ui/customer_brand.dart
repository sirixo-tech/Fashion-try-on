import '../l10n/customer_copy.dart';
import 'package:flutter/material.dart';

/// The approved logo asset; independent from web/kiosk presentation widgets.
class CustomerBrand extends StatelessWidget {
  static const asset = 'assets/branding/selfx-logo.png';
  final bool compact;
  const CustomerBrand({super.key, this.compact = false});

  @override
  Widget build(BuildContext context) => Semantics(
    label: tr(context, 'SelfX'),
    image: true,
    child: ExcludeSemantics(
      child: Image.asset(
        asset,
        width: compact ? 112 : 164,
        height: compact ? 42 : 61,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
      ),
    ),
  );
}
