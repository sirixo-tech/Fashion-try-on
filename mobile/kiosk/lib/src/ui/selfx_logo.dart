import 'package:flutter/material.dart';

const selfxLogoAssetPath = 'assets/branding/selfx-logo.png';

class SelfxLogo extends StatelessWidget {
  const SelfxLogo({
    super.key,
    this.height = 54,
    this.maxWidth = 220,
    this.framed = false,
    this.taglineColor,
  });

  final double height;
  final double maxWidth;
  final bool framed;
  final Color? taglineColor;

  @override
  Widget build(BuildContext context) {
    final customTaglineColor = taglineColor;
    final logo = Semantics(
      label: customTaglineColor == null
          ? 'SelfX'
          : 'SelfX. Make your business standout.',
      image: true,
      child: customTaglineColor == null
          ? Image.asset(
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
            )
          : _SelfxLogoWithReadableTagline(
              height: height,
              maxWidth: maxWidth,
              taglineColor: customTaglineColor,
              framed: framed,
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

class _SelfxLogoWithReadableTagline extends StatelessWidget {
  const _SelfxLogoWithReadableTagline({
    required this.height,
    required this.maxWidth,
    required this.taglineColor,
    required this.framed,
  });

  final double height;
  final double maxWidth;
  final Color taglineColor;
  final bool framed;

  @override
  Widget build(BuildContext context) {
    final markHeight = height * 0.78;
    final fullAssetHeight = markHeight / 0.78;
    return SizedBox(
      height: height,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: markHeight,
            child: ClipRect(
              child: Align(
                alignment: Alignment.topCenter,
                heightFactor: 0.78,
                child: Image.asset(
                  selfxLogoAssetPath,
                  height: fullAssetHeight,
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
              ),
            ),
          ),
          SizedBox(height: height * 0.02),
          SizedBox(
            width: maxWidth,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                'MAKE YOUR BUSINESS STANDOUT',
                maxLines: 1,
                style: TextStyle(
                  color: taglineColor,
                  fontSize: height * 0.15,
                  fontWeight: FontWeight.w900,
                  height: 1,
                  letterSpacing: 0,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
