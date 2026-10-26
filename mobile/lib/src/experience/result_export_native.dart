import 'dart:typed_data';
import 'package:gal/gal.dart';

Future<void> exportResult(Uint8List bytes, String name) =>
    Gal.putImageBytes(bytes, name: name);
