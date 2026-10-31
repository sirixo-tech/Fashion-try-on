import 'package:flutter/material.dart';

class CustomerHomeScope extends InheritedWidget {
  final VoidCallback goHome;

  const CustomerHomeScope({
    super.key,
    required this.goHome,
    required super.child,
  });

  static VoidCallback? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<CustomerHomeScope>()?.goHome;

  @override
  bool updateShouldNotify(CustomerHomeScope oldWidget) =>
      goHome != oldWidget.goHome;
}

class CustomerHomeBackButton extends StatelessWidget {
  const CustomerHomeBackButton({super.key});

  @override
  Widget build(BuildContext context) => BackButton(
    onPressed: () {
      final goHome = CustomerHomeScope.maybeOf(context);
      if (goHome != null) {
        goHome();
      } else {
        Navigator.maybePop(context);
      }
    },
  );
}
