import 'dart:js_interop';
import 'dart:typed_data';
import 'package:web/web.dart' as web;

Future<void> exportResult(Uint8List bytes, String name) async {
  final blob = web.Blob(
    [bytes.toJS].toJS,
    web.BlobPropertyBag(type: 'application/octet-stream'),
  );
  final url = web.URL.createObjectURL(blob);
  final extension = bytes.length > 3 && bytes[0] == 0xff && bytes[1] == 0xd8
      ? 'jpg'
      : bytes.length > 12 && bytes[8] == 0x57
      ? 'webp'
      : 'png';
  final link = web.HTMLAnchorElement()
    ..href = url
    ..download = '$name.$extension';
  web.document.body?.append(link);
  link.click();
  link.remove();
  Future<void>.delayed(
    const Duration(seconds: 5),
    () => web.URL.revokeObjectURL(url),
  );
}
