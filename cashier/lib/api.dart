import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;
  @override
  String toString() => message;
}

/// Thrown when the server cannot be reached (offline, wrong address, timeout).
class OfflineException implements Exception {
  @override
  String toString() => 'Cannot reach the server.';
}

class Api {
  Api(this.baseUrl);
  final String baseUrl;
  String? token;

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$baseUrl$path').replace(queryParameters: query);

  Map<String, String> get _headers => {
        'content-type': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
      };

  dynamic _handle(http.Response r) {
    final dynamic body = r.body.isEmpty ? null : jsonDecode(r.body);
    if (r.statusCode >= 400) {
      final msg = body is Map && body['error'] != null
          ? body['error'].toString()
          : 'Request failed (${r.statusCode})';
      throw ApiException(r.statusCode, msg);
    }
    return body;
  }

  Future<dynamic> _send(Future<http.Response> Function() call) async {
    try {
      return _handle(await call().timeout(const Duration(seconds: 10)));
    } on ApiException {
      rethrow;
    } catch (_) {
      throw OfflineException();
    }
  }

  Future<dynamic> get(String path, [Map<String, String>? query]) =>
      _send(() => http.get(_uri(path, query), headers: _headers));

  Future<dynamic> post(String path, Object body) =>
      _send(() => http.post(_uri(path), headers: _headers, body: jsonEncode(body)));
}
