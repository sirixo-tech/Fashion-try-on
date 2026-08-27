import 'package:flutter/material.dart';

class SelfxSuccessIconPulse extends StatefulWidget {
  const SelfxSuccessIconPulse({
    super.key,
    required this.icon,
    required this.backgroundColor,
    this.iconSize = 18,
    this.padding = const EdgeInsets.all(5),
  });

  final IconData icon;
  final Color backgroundColor;
  final double iconSize;
  final EdgeInsetsGeometry padding;

  @override
  State<SelfxSuccessIconPulse> createState() => _SelfxSuccessIconPulseState();
}

class _SelfxSuccessIconPulseState extends State<SelfxSuccessIconPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 760),
    );
    _scale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 1, end: 1.18), weight: 38),
      TweenSequenceItem(tween: Tween(begin: 1.18, end: 0.96), weight: 24),
      TweenSequenceItem(tween: Tween(begin: 0.96, end: 1.08), weight: 18),
      TweenSequenceItem(tween: Tween(begin: 1.08, end: 1), weight: 20),
    ]).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
    _start();
  }

  @override
  void didUpdateWidget(covariant SelfxSuccessIconPulse oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.icon != oldWidget.icon ||
        widget.backgroundColor != oldWidget.backgroundColor) {
      _start();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _start() {
    _controller
      ..reset()
      ..repeat();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: widget.backgroundColor,
          shape: BoxShape.circle,
        ),
        child: Padding(
          padding: widget.padding,
          child: Icon(widget.icon, size: widget.iconSize, color: Colors.white),
        ),
      ),
    );
  }
}

class SelfxActionPulse extends StatefulWidget {
  const SelfxActionPulse({super.key, required this.child, this.enabled = true});

  final Widget child;
  final bool enabled;

  @override
  State<SelfxActionPulse> createState() => _SelfxActionPulseState();
}

class _SelfxActionPulseState extends State<SelfxActionPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _scale;
  late final Animation<double> _glow;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _scale = Tween<double>(
      begin: 1,
      end: 1.026,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
    _glow = Tween<double>(
      begin: 0.16,
      end: 0.42,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
    if (widget.enabled) {
      _start();
    }
  }

  @override
  void didUpdateWidget(covariant SelfxActionPulse oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.enabled != oldWidget.enabled) {
      if (widget.enabled) {
        _start();
      } else {
        _stop();
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _start() {
    _controller
      ..reset()
      ..repeat(reverse: true);
  }

  void _stop() {
    if (!mounted) {
      return;
    }
    _controller.stop();
    _controller.value = 0;
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled) {
      return widget.child;
    }
    return AnimatedBuilder(
      animation: _controller,
      child: widget.child,
      builder: (context, child) {
        return Transform.scale(
          scale: _scale.value,
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFFF7119).withValues(alpha: _glow.value),
                  blurRadius: 22,
                  spreadRadius: 1.6,
                ),
              ],
            ),
            child: child,
          ),
        );
      },
    );
  }
}
