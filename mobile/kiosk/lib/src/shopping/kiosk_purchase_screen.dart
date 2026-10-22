import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../tryon/kiosk_try_on_session_controller.dart';
import '../ui/selfx_kiosk_button.dart';
import 'kiosk_shopping_gateway.dart';

String _key() => List.generate(
  24,
  (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
).join();
List<Map<String, dynamic>> _items(dynamic value) => (value as List? ?? [])
    .map((item) => Map<String, dynamic>.from(item as Map))
    .toList();
String shoppingMoney(dynamic cents, dynamic currency) => cents is int
    ? '${currency ?? ''} ${(cents / 100).toStringAsFixed(2)}'
    : 'Price not set';
String stockMessage(String store) => 'Out of stock. Please contact $store.';
final Expando<bool> _opening = Expando<bool>();

Future<void> openKioskPurchase(
  BuildContext context,
  KioskTryOnSessionController controller,
  String? productId,
) async {
  if (_opening[controller] == true) return;
  _opening[controller] = true;
  try {
    await _openKioskPurchase(context, controller, productId);
  } finally {
    _opening[controller] = false;
  }
}

Future<void> _openKioskPurchase(
  BuildContext context,
  KioskTryOnSessionController controller,
  String? productId,
) async {
  final gateway = controller.shoppingGateway,
      session = controller.activeSessionId,
      revision = controller.customerSessionRevision;
  if (productId == null || gateway == null || session == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Purchasing is available for Store catalog products. Please contact Store staff.',
        ),
      ),
    );
    return;
  }
  try {
    final stock = await gateway.request(
      'GET',
      '/api/v1/kiosk/catalog/products/$productId/stock',
    );
    final cart = await gateway.request(
      'GET',
      '/api/v1/kiosk/try-on/sessions/$session/shopping/cart',
    );
    if (!context.mounted || !controller.isCustomerSessionCurrent(revision)) {
      return;
    }
    final store = stock['storeName'] as String? ?? 'the Store';
    if (cart['activeOrderId'] == null &&
        stock['configured'] == true &&
        (stock['totalAvailableStockQuantity'] as int? ?? 0) == 0) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(stockMessage(store))));
      return;
    }
    if (stock['configured'] != true) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Purchasing is not configured. Please contact $store.'),
        ),
      );
      return;
    }
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => KioskPurchaseScreen(
          gateway: gateway,
          controller: controller,
          revision: revision,
          sessionId: session,
          stock: stock,
          initialCart: cart,
        ),
      ),
    );
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            error is KioskShoppingException
                ? error.message
                : 'Purchasing is temporarily unavailable. Please try again.',
          ),
        ),
      );
    }
  }
}

class KioskPurchaseScreen extends StatefulWidget {
  const KioskPurchaseScreen({
    super.key,
    required this.gateway,
    required this.controller,
    required this.revision,
    required this.sessionId,
    required this.stock,
    required this.initialCart,
  });
  final KioskShoppingGateway gateway;
  final KioskTryOnSessionController controller;
  final int revision;
  final String sessionId;
  final Map<String, dynamic> stock, initialCart;
  @override
  State<KioskPurchaseScreen> createState() => _KioskPurchaseScreenState();
}

class _KioskPurchaseScreenState extends State<KioskPurchaseScreen> {
  late Map<String, dynamic> cart;
  late Map<String, dynamic> stock;
  Map<String, dynamic>? order, attempt;
  String? size, color;
  int quantity = 1;
  String? checkoutKey, paymentKey;
  Map<String, dynamic>? checkoutBody;
  String? error;
  bool busy = false, polling = false;
  Timer? timer;
  final Stopwatch elapsed = Stopwatch()..start();
  DateTime? serverAnchor;
  int anchorMillis = 0, ticks = 0;
  void anchor(Map<String, dynamic> response) {
    final time = DateTime.tryParse(response['serverTime']?.toString() ?? '');
    if (time != null) {
      serverAnchor = time;
      anchorMillis = elapsed.elapsedMilliseconds;
    }
  }

  DateTime get serverNow => (serverAnchor ?? DateTime.now()).add(
    Duration(
      milliseconds: serverAnchor == null
          ? 0
          : elapsed.elapsedMilliseconds - anchorMillis,
    ),
  );
  Duration get remaining =>
      (DateTime.tryParse(order?['expiresAt']?.toString() ?? '') ?? serverNow)
          .difference(serverNow);
  bool get expired => remaining <= Duration.zero;
  void hold() {
    if (current &&
        order != null &&
        ![
          'PAID',
          'PAID_REVIEW',
          'CANCELLED',
          'EXPIRED',
        ].contains(order!['status']) &&
        !expired) {
      widget.controller.holdPurchaseDisplay(remaining);
    }
  }

  bool get current =>
      widget.controller.isCustomerSessionCurrent(widget.revision) &&
      widget.controller.activeSessionId == widget.sessionId;
  String get root =>
      '/api/v1/kiosk/try-on/sessions/${widget.sessionId}/shopping';
  String get storeName => stock['storeName'] as String? ?? 'the Store';
  List<Map<String, dynamic>> get variants => _items(stock['variants']);
  bool get hasSize => ['SIZE', 'SIZE_COLOR'].contains(stock['optionMode']);
  bool get hasColor => ['COLOR', 'SIZE_COLOR'].contains(stock['optionMode']);
  Map<String, dynamic>? get selected {
    if ((hasSize && size == null) || (hasColor && color == null)) return null;
    for (final v in variants) {
      if ((!hasSize || v['size'] == size) &&
          (!hasColor || v['color'] == color)) {
        return v;
      }
    }
    return null;
  }

  int available(Map<String, dynamic> v) =>
      v['availableStockQuantity'] as int? ?? 0;
  @override
  void initState() {
    super.initState();
    stock = widget.stock;
    cart = widget.initialCart;
    widget.controller.addListener(sessionChanged);
    if (cart['activeOrderId'] != null) unawaited(resume());
    timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || !current) return;
      setState(() {});
      if (++ticks % 5 == 0 && order != null && !busy) unawaited(poll());
    });
    anchor(cart);
  }

  @override
  void dispose() {
    timer?.cancel();
    elapsed.stop();
    widget.controller.removeListener(sessionChanged);
    if (current) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (current) widget.controller.holdPurchaseDisplay(null);
      });
    }
    super.dispose();
  }

  void sessionChanged() {
    if (!current) {
      timer?.cancel();
      if (mounted) {
        setState(() {
          error =
              'This customer session has ended. Please return to the kiosk home.';
          attempt = null;
        });
      }
    }
  }

  Future<void> resume() async {
    await act(() async {
      order = await widget.gateway.request(
        'GET',
        '$root/orders/${cart['activeOrderId']}',
      );
      anchor(order!);
      hold();
      final attempts = _items(order!['paymentAttempts'])
        ..sort(
          (a, b) =>
              b['createdAt'].toString().compareTo(a['createdAt'].toString()),
        );
      if (attempts.isNotEmpty) {
        final id = attempts.first['id'];
        attempt = await widget.gateway.request(
          'GET',
          '$root/orders/${order!['id']}/payments/$id',
        );
      }
      if ([
        'PAID',
        'PAID_REVIEW',
        'CANCELLED',
        'EXPIRED',
      ].contains(order!['status'])) {
        timer?.cancel();
        widget.controller.holdPurchaseDisplay(null);
      }
    });
  }

  Future<void> act(Future<void> Function() action) async {
    if (busy || !current) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
    } catch (caught) {
      if (mounted && current) {
        error = caught is KioskShoppingException
            ? caught.message
            : 'Connection interrupted. Try again to check the existing order.';
        if (caught is KioskShoppingException &&
            (caught.code.contains('VERSION') ||
                caught.code.contains('QUOTE'))) {
          try {
            cart = await widget.gateway.request('GET', '$root/cart');
            checkoutKey = null;
            checkoutBody = null;
            error =
                'Your order changed. Review the updated options and total before continuing.';
          } catch (_) {}
        }
        if (!mounted || !current) return;
        if (caught is KioskShoppingException &&
            [
              'SHOPPING_OUT_OF_STOCK',
              'SHOPPING_STOCK_UNAVAILABLE',
              'SHOPPING_INSUFFICIENT_STOCK',
            ].contains(caught.code)) {
          error = stockMessage(storeName);
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(error!)));
          try {
            stock = await widget.gateway.request(
              'GET',
              '/api/v1/kiosk/catalog/products/${stock['productId']}/stock',
            );
          } catch (_) {}
        }
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> add() => act(() async {
    final variant = selected;
    if (variant == null || available(variant) < quantity) return;
    final lines = _items(cart['items'])
        .map(
          (line) => {
            'variantId': line['variantId'],
            'quantity': line['quantity'],
          },
        )
        .toList();
    final index = lines.indexWhere(
      (line) => line['variantId'] == variant['id'],
    );
    if (index >= 0) {
      lines[index]['quantity'] = (lines[index]['quantity'] as int) + quantity;
    } else {
      lines.add({'variantId': variant['id'], 'quantity': quantity});
    }
    cart = await widget.gateway.request('PUT', '$root/cart', {
      'expectedVersion': cart['version'],
      'items': lines,
    });
    checkoutKey = null;
    checkoutBody = null;
  });
  Future<void> remove(String id) => act(() async {
    cart = await widget.gateway.request('PUT', '$root/cart', {
      'expectedVersion': cart['version'],
      'items': _items(cart['items'])
          .where((line) => line['variantId'] != id)
          .map(
            (line) => {
              'variantId': line['variantId'],
              'quantity': line['quantity'],
            },
          )
          .toList(),
    });
    checkoutKey = null;
    checkoutBody = null;
  });
  Future<void> checkout() => act(() async {
    if (order == null) {
      checkoutKey ??= _key();
      checkoutBody ??= {
        'expectedVersion': cart['version'],
        'quoteFingerprint': cart['quoteFingerprint'],
        'idempotencyKey': checkoutKey,
      };
      try {
        order = await widget.gateway.request(
          'POST',
          '$root/checkout',
          checkoutBody,
        );
        anchor(order!);
        hold();
      } on KioskShoppingException catch (caught) {
        if (caught.code.contains('QUOTE') || caught.code.contains('VERSION')) {
          cart = await widget.gateway.request('GET', '$root/cart');
          checkoutBody = null;
          checkoutKey = null;
        }
        rethrow;
      }
    }
    if (attempt == null || attempt!['status'] == 'FAILED') {
      paymentKey ??= _key();
      attempt = await widget.gateway.request(
        'POST',
        '$root/orders/${order!['id']}/payments',
        {'idempotencyKey': paymentKey},
      );
    }
  });
  Future<void> poll() async {
    if (polling || !current || order == null) return;
    polling = true;
    try {
      final id = order!['id'];
      if (attempt != null) {
        final fresh = await widget.gateway.request(
          'POST',
          '$root/orders/$id/payments/${attempt!['id']}/check',
          {},
        );
        if (!mounted || !current) return;
        attempt = fresh;
      }
      final freshOrder = await widget.gateway.request(
        'GET',
        '$root/orders/$id',
      );
      if (!mounted || !current) return;
      setState(() {
        order = freshOrder;
        anchor(freshOrder);
      });
      if ([
        'PAID',
        'PAID_REVIEW',
        'CANCELLED',
        'EXPIRED',
      ].contains(order!['status'])) {
        timer?.cancel();
        widget.controller.holdPurchaseDisplay(null);
      }
    } catch (_) {
      if (mounted && current) {
        setState(
          () => error =
              'Still checking payment. Do not pay again. Please keep your order reference.',
        );
      }
    } finally {
      polling = false;
    }
  }

  Future<void> cancelOrder() => act(() async {
    order = await widget.gateway.request(
      'POST',
      '$root/orders/${order!['id']}/cancel',
      {'reason': 'Customer cancelled before payment'},
    );
    cart = await widget.gateway.request('GET', '$root/cart');
    order = null;
    checkoutKey = null;
    checkoutBody = null;
    paymentKey = null;
  });
  @override
  Widget build(BuildContext context) {
    final chosen = selected, status = order?['status'];
    final prices =
        variants
            .where(
              (v) =>
                  (color == null || v['color'] == color) &&
                  (size == null || v['size'] == size),
            )
            .map((v) => v['effectivePriceAmountCents'])
            .whereType<int>()
            .toSet()
            .toList()
          ..sort();
    final shownPrice =
        chosen?['effectivePriceAmountCents'] ??
        (prices.isEmpty ? stock['basePriceAmountCents'] : prices.first);

    String? image = stock['imageUrl'] as String?;
    for (final entry in _items(stock['colorImages'])) {
      if (color != null &&
          entry['color'].toString().toLowerCase() == color!.toLowerCase()) {
        image = entry['url'] as String? ?? image;
      }
    }
    final fallback = stock['imageUrl'] as String?;
    final preview = image == null
        ? const Icon(Icons.image_outlined, size: 100)
        : Image.network(
            image,
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) => fallback != null && image != fallback
                ? Image.network(
                    fallback,
                    fit: BoxFit.contain,
                    errorBuilder: (_, _, _) =>
                        const Icon(Icons.image_outlined, size: 100),
                  )
                : const Icon(Icons.image_outlined, size: 100),
          );
    return PopScope(
      canPop: !busy,
      child: Scaffold(
        appBar: AppBar(title: const Text('Buy This Look')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: [
              Text(storeName, style: Theme.of(context).textTheme.titleLarge),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text(error!, key: const Key('purchase-error')),
                ),
              if (!current)
                SelfxKioskButton(
                  label: 'Back to Home',
                  onPressed: () =>
                      Navigator.of(context).popUntil((route) => route.isFirst),
                )
              else if (order != null) ...[
                Text(
                  'Order ${order!['reference']}',
                  key: const Key('purchase-reference'),
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                Text(shoppingMoney(order!['totalCents'], order!['currency'])),
                if (status == 'PAID')
                  const Text(
                    'Payment successful. Please contact Store staff to collect your purchase.',
                    key: Key('purchase-paid'),
                  )
                else if (status == 'PAID_REVIEW')
                  Text(
                    'Payment received. Please contact $storeName with your order reference. Your order needs staff attention.',
                  )
                else if (status == 'CANCELLED' || status == 'EXPIRED')
                  const Text(
                    'This order is closed. If you paid, contact Store staff with the order reference.',
                  )
                else ...[
                  if (attempt?['testOnly'] == true)
                    const Text('TEST MODE — this is not a live purchase.'),
                  if (!expired && attempt?['qrString'] is String)
                    Center(
                      child: QrImageView(
                        data: attempt!['qrString'] as String,
                        size: 280,
                        backgroundColor: Colors.white,
                      ),
                    ),
                  if (expired)
                    const Text(
                      'Payment time has ended. Do not scan an old QR. Check payment status or contact Store staff.',
                    )
                  else
                    Text(
                      'Payment time remaining: ${remaining.inSeconds ~/ 60}:${(remaining.inSeconds % 60).toString().padLeft(2, '0')}',
                    ),
                  Text(
                    attempt?['status'] == 'FAILED'
                        ? 'Payment failed. You can retry while this order is available.'
                        : attempt == null
                        ? 'Order reserved. Continue to payment.'
                        : 'Waiting for payment confirmation. Do not pay again while confirmation is pending.',
                  ),
                  Text(
                    'Pay only the displayed amount: ${shoppingMoney(order!['totalCents'], order!['currency'])}',
                  ),
                  SelfxKioskButton(
                    label: busy ? 'Please wait…' : 'Check payment status',
                    onPressed: busy ? null : () => unawaited(poll()),
                  ),
                  if (!expired &&
                      (attempt == null || attempt?['status'] == 'FAILED'))
                    SelfxKioskButton(
                      label: 'Continue to payment',
                      onPressed: busy
                          ? null
                          : () {
                              if (attempt?['status'] == 'FAILED') {
                                attempt = null;
                                paymentKey = null;
                              }
                              unawaited(checkout());
                            },
                    ),
                  if (status == 'AWAITING_PAYMENT' && attempt == null)
                    TextButton(
                      onPressed: busy ? null : () => unawaited(cancelOrder()),
                      child: const Text('Cancel unpaid order'),
                    ),
                ],
              ] else ...[
                Text(
                  stock['productName']?.toString() ?? 'Product',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                SizedBox(height: 320, child: preview),
                Text(
                  '${chosen == null && prices.length > 1 ? 'From ' : ''}${shoppingMoney(shownPrice, stock['priceCurrency'])}',
                  key: const Key('purchase-price'),
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                if (hasColor)
                  Wrap(
                    spacing: 12,
                    children: variants
                        .map((v) => v['color'] as String)
                        .toSet()
                        .map(
                          (value) => ChoiceChip(
                            label: Text(value),
                            selected: color == value,
                            onSelected:
                                busy ||
                                    !variants.any(
                                      (v) =>
                                          v['color'] == value &&
                                          available(v) > 0,
                                    )
                                ? null
                                : (_) => setState(() {
                                    color = value;
                                    quantity = 1;
                                    if (!variants.any(
                                      (v) =>
                                          v['size'] == size &&
                                          v['color'] == color &&
                                          available(v) > 0,
                                    )) {
                                      size = null;
                                    }
                                  }),
                          ),
                        )
                        .toList(),
                  ),
                if (hasSize)
                  Wrap(
                    spacing: 12,
                    children: variants
                        .map((v) => v['size'] as String)
                        .toSet()
                        .map(
                          (value) => ChoiceChip(
                            label: Text(value),
                            selected: size == value,
                            onSelected:
                                busy ||
                                    !variants.any(
                                      (v) =>
                                          v['size'] == value &&
                                          (color == null ||
                                              v['color'] == color) &&
                                          available(v) > 0,
                                    )
                                ? null
                                : (_) => setState(() {
                                    size = value;
                                    quantity = 1;
                                  }),
                          ),
                        )
                        .toList(),
                  ),
                if (chosen != null) Text('${available(chosen)} available'),
                Row(
                  children: [
                    IconButton(
                      onPressed: busy || quantity <= 1
                          ? null
                          : () => setState(() => quantity--),
                      icon: const Icon(Icons.remove),
                    ),
                    Text('$quantity'),
                    IconButton(
                      onPressed:
                          busy ||
                              chosen == null ||
                              quantity >= available(chosen)
                          ? null
                          : () => setState(() => quantity++),
                      icon: const Icon(Icons.add),
                    ),
                  ],
                ),
                SelfxKioskButton(
                  label: 'Add to order',
                  onPressed:
                      busy ||
                          chosen == null ||
                          available(chosen) < quantity ||
                          chosen['effectivePriceAmountCents'] == null
                      ? null
                      : () => unawaited(add()),
                ),
                const SizedBox(height: 24),
                Text(
                  'Your order',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                for (final line in _items(cart['items']))
                  ListTile(
                    title: Text(
                      '${line['productName']} · ${[line['size'], line['color']].where((v) => v != null).join(' / ')} × ${line['quantity']}',
                    ),
                    subtitle: Text(
                      shoppingMoney(line['totalCents'], line['currency']),
                    ),
                    trailing: IconButton(
                      onPressed: busy
                          ? null
                          : () =>
                                unawaited(remove(line['variantId'] as String)),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ),
                Text(
                  'Tax: ${shoppingMoney(cart['taxCents'], cart['currency'])}',
                ),
                Text(
                  'Total: ${shoppingMoney(cart['totalCents'], cart['currency'])}',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                if (_items(cart['issues']).isNotEmpty)
                  const Text(
                    'Review availability and pricing before paying. Remove unavailable options or contact Store staff.',
                  ),
                if (cart['paymentAvailable'] != true)
                  const Text(
                    'Checkout is not currently available. Please contact Store staff.',
                  ),
                SelfxKioskButton(
                  label: busy ? 'Please wait…' : 'Pay',
                  onPressed:
                      busy ||
                          cart['paymentAvailable'] != true ||
                          cart['canCheckout'] != true
                      ? null
                      : () => unawaited(checkout()),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
