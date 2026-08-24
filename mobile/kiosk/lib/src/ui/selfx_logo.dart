import 'package:flutter/material.dart';

const selfxLogoAssetPath = 'assets/branding/selfx-logo.png';

class SelfxLogo extends StatelessWidget {
  const SelfxLogo({
    super.key,
    this.height = 54,
    this.maxWidth = 220,
    this.framed = false,
  });

  final double height;
  final double maxWidth;
  final bool framed;

  @override
  Widget build(BuildContext context) {
    final logo = Semantics(
      label: 'SelfX',
      image: true,
      child: Image.asset(
        selfxLogoAssetPath,
        height: height,
        fit: BoxFit.contain,
        filterQuality: FilterQuality.high,
        errorBuilder: (_, _, _) => Text(
          'SelfX',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w900,
            color: framed ? const Color(0xFFFF7119) : null,
          ),
        ),
      ),
    );

    final constrained = ConstrainedBox(
      constraints: BoxConstraints(maxWidth: maxWidth),
      child: logo,
    );

    if (!framed) {
      return constrained;
    }

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: const [
          BoxShadow(
            color: Color(0x180F172A),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: constrained,
      ),
    );
  }
}
