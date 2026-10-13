import 'dart:async';

import 'package:flutter/material.dart';

import '../idle/kiosk_idle_presentation.dart';
import '../theme/selfx_kiosk_theme.dart';

/// Paint-only colour/scale animation; phrase layout positions never change.
class AnimatedHomeHeadline extends StatefulWidget {
  const AnimatedHomeHeadline({
    super.key,
    required this.title,
    required this.style,
    this.enabled = true,
  });

  final String title;
  final TextStyle? style;
  final bool enabled;

  @override
  State<AnimatedHomeHeadline> createState() => _AnimatedHomeHeadlineState();
}

class _AnimatedHomeHeadlineState extends State<AnimatedHomeHeadline>
    with SingleTickerProviderStateMixin {
  static const _phraseDuration = Duration(milliseconds: 1500);
  static const _cyclePause = Duration(seconds: 3);
  late final AnimationController _transition;
  Timer? _timer;
  int _phrase = 2;
  int _from = 2;
  int _to = 2;
  bool _running = false;

  @override
  void initState() {
    super.initState();
    _transition = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 350),
      value: 1,
    );
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncAnimation();
  }

  @override
  void didUpdateWidget(covariant AnimatedHomeHeadline oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncAnimation();
  }

  void _syncAnimation() {
    final animate =
        widget.enabled &&
        widget.title == defaultIdlePresentation.title &&
        !MediaQuery.disableAnimationsOf(context) &&
        TickerMode.valuesOf(context).enabled;
    if (animate == _running) return;
    _timer?.cancel();
    _transition.stop();
    _running = animate;
    _phrase = animate ? 0 : 2;
    _from = _to = _phrase;
    _transition.value = 1;
    if (animate) _schedule(_phraseDuration, _advance);
  }

  void _schedule(Duration duration, VoidCallback action) {
    _timer?.cancel();
    _timer = Timer(duration, () {
      if (mounted && _running) action();
    });
  }

  void _advance() {
    if (_phrase == 2) {
      // Love It remains orange throughout the three-second cycle pause.
      _schedule(_cyclePause, () => _highlight(0));
    } else {
      _highlight(_phrase + 1);
    }
  }

  void _highlight(int phrase) {
    _from = _to;
    _to = _phrase = phrase;
    _transition.forward(from: 0);
    _schedule(_phraseDuration, _advance);
  }

  Color _colour(int phrase) => Color.lerp(
    _from == phrase ? SelfxKioskTokens.homeOrange : Colors.white,
    _to == phrase ? SelfxKioskTokens.homeOrange : Colors.white,
    Curves.easeInOut.transform(_transition.value),
  )!;

  double _scale(int phrase) {
    if (!_running) return 1;
    final progress = Curves.easeInOut.transform(_transition.value);
    final from = _from == phrase ? 1.05 : 1.0;
    final to = _to == phrase ? 1.05 : 1.0;
    return from + (to - from) * progress;
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _transition,
    builder: (context, _) => Semantics(
      key: const Key('home-animated-headline'),
      label: widget.title,
      child: ExcludeSemantics(
        child: widget.title != defaultIdlePresentation.title
            ? Text(
                widget.title,
                style: widget.style,
                maxLines: 1,
                softWrap: false,
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var index = 0; index < 3; index++) ...[
                    if (index > 0) Text(' ', style: widget.style),
                    Transform.scale(
                      key: ValueKey('home-headline-scale-$index'),
                      scale: _scale(index),
                      child: Text(
                        ['See It.', 'Try It.', 'Love It.'][index],
                        key: ValueKey('home-headline-phrase-$index'),
                        style:
                            (widget.style ?? DefaultTextStyle.of(context).style)
                                .copyWith(color: _colour(index)),
                        maxLines: 1,
                        softWrap: false,
                      ),
                    ),
                  ],
                ],
              ),
      ),
    ),
  );

  @override
  void dispose() {
    _timer?.cancel();
    _transition.dispose();
    super.dispose();
  }
}
