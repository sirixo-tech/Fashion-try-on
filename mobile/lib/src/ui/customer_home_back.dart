import 'package:flutter/material.dart';

class CustomerHomeBackButton extends StatelessWidget {
  const CustomerHomeBackButton({super.key});

  @override
  Widget build(BuildContext context) =>
      BackButton(onPressed: () => Navigator.maybePop(context));
}
