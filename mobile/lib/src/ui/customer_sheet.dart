import 'package:flutter/material.dart';
import 'customer_theme.dart';

Future<T?> showCustomerSheet<T>(BuildContext context, WidgetBuilder builder) =>
    showModalBottomSheet<T>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: CustomerColors.canvas,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
      ),
      builder: (context) => SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: builder(context),
        ),
      ),
    );
