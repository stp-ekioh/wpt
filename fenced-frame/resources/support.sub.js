// Like `promise_test()`, but executes tests in parallel like `async_test()`.
//
// Cribbed from COEP tests.
function promise_test_parallel(promise, description) {
  async_test(test => {
    promise(test)
        .then(() => test.done())
        .catch(test.step_func(error => { throw error; }));
  }, description);
};

// Maps protocol (without the trailing colon) and address space to port.
const SERVER_PORTS = {
  "http": {
    "loopback": {{ports[http][0]}},
    "local": {{ports[http-private][0]}},
    "public": {{ports[http-public][0]}},
  },
  "https": {
    "loopback": {{ports[https][0]}},
    "other-loopback": {{ports[https][1]}},
    "local": {{ports[https-private][0]}},
    "public": {{ports[https-public][0]}},
  },
  "ws": {
    "loopback": {{ports[ws][0]}},
  },
  "wss": {
    "loopback": {{ports[wss][0]}},
  },
};

// A `Server` is a web server accessible by tests. It has the following shape:
//
// {
//   addressSpace: the IP address space of the server ("local", "private" or
//     "public"),
//   name: a human-readable name for the server,
//   port: the port on which the server listens for connections,
//   protocol: the protocol (including trailing colon) spoken by the server,
// }
//
// Constants below define the available servers, which can also be accessed
// programmatically with `get()`.
class Server {
  // Maps the given `protocol` (without a trailing colon) and `addressSpace` to
  // a server. Returns null if no such server exists.
  static get(protocol, addressSpace) {
    const ports = SERVER_PORTS[protocol];
    if (ports === undefined) {
      return null;
    }

    const port = ports[addressSpace];
    if (port === undefined) {
      return null;
    }

    return {
      addressSpace,
      name: `${protocol}-${addressSpace}`,
      port,
      protocol: protocol + ':',
    };
  }

  static HTTP_LOCAL = Server.get("http", "loopback");
  static HTTP_PRIVATE = Server.get("http", "local");
  static HTTP_PUBLIC = Server.get("http", "public");
  static HTTPS_LOCAL = Server.get("https", "loopback");
  static OTHER_HTTPS_LOCAL = Server.get("https", "other-loopback");
  static HTTPS_PRIVATE = Server.get("https", "local");
  static HTTPS_PUBLIC = Server.get("https", "public");
  static WS_LOCAL = Server.get("ws", "loopback");
  static WSS_LOCAL = Server.get("wss", "loopback");
};

// Resolves a URL relative to the current location, returning an absolute URL.
//
// `url` specifies the relative URL, e.g. "foo.html" or "http://foo.example".
// `options`, if defined, should have the following shape:
//
//   {
//     // Optional. Overrides the protocol of the returned URL.
//     protocol,
//
//     // Optional. Overrides the port of the returned URL.
//     port,
//
//     // Extra headers.
//     headers,
//
//     // Extra search params.
//     searchParams,
//   }
//
function resolveUrl(url, options) {
  const result = new URL(url, window.location);
  if (options === undefined) {
    return result;
  }

  const { port, protocol, headers, searchParams } = options;
  if (port !== undefined) {
    result.port = port;
  }
  if (protocol !== undefined) {
    result.protocol = protocol;
  }
  if (headers !== undefined) {
    const pipes = [];
    for (key in headers) {
      pipes.push(`header(${key},${headers[key]})`);
    }
    result.searchParams.append("pipe", pipes.join("|"));
  }
  if (searchParams !== undefined) {
    for (key in searchParams) {
      result.searchParams.append(key, searchParams[key]);
    }
  }

  return result;
}

// Computes options to pass to `resolveUrl()` for a source document's URL.
//
// `server` identifies the server from which to load the document.
// `treatAsPublic`, if set to true, specifies that the source document should
// be artificially placed in the `public` address space using CSP.
function sourceResolveOptions({ server, treatAsPublic }) {
  const options = {...server};
  if (treatAsPublic) {
    options.headers = { "Content-Security-Policy": "treat-as-public-address" };
  }
  return options;
}

// Computes the URL of a preflight handler configured with the given options.
//
// `server` identifies the server from which to load the resource.
// `behavior` specifies the behavior of the target server. It may contain:
//   - `preflight`: The result of calling one of `PreflightBehavior`'s methods.
//   - `response`: The result of calling one of `ResponseBehavior`'s methods.
//   - `redirect`: A URL to which the target should redirect GET requests.
function preflightUrl({ server, behavior }) {
  assert_not_equals(server, undefined, 'server');
  const options = {...server};
  if (behavior) {
    const { preflight, response, redirect, file } = behavior;
    options.searchParams = {
      ...preflight,
      ...response,
    };
    if (redirect !== undefined) {
      options.searchParams.redirect = redirect;
    }
    if (file !== undefined) {
      options.searchParams.file = file;
    }
  }

  return resolveUrl("resources/preflight.py", options);
}

// Methods generate behavior specifications for how `resources/preflight.py`
// should behave upon receiving a preflight request.
const PreflightBehavior = {
  // The preflight response should fail with a non-2xx code.
  failure: () => ({}),

  // The preflight response should be missing CORS headers.
  // `uuid` should be a UUID that uniquely identifies the preflight request.
  noCorsHeader: (uuid) => ({
    "preflight-uuid": uuid,
  }),

  // The preflight response should be missing PNA headers.
  // `uuid` should be a UUID that uniquely identifies the preflight request.
  noPnaHeader: (uuid) => ({
    "preflight-uuid": uuid,
    "preflight-headers": "cors",
  }),

  // The preflight response should succeed.
  // `uuid` should be a UUID that uniquely identifies the preflight request.
  success: (uuid) => ({
    "preflight-uuid": uuid,
    "preflight-headers": "cors+pna",
  }),

  optionalSuccess: (uuid) => ({
    "preflight-uuid": uuid,
    "preflight-headers": "cors+pna",
    "is-preflight-optional": true,
  }),

  // The preflight response should succeed only if it is the first preflight.
  // `uuid` should be a UUID that uniquely identifies the preflight request.
  singlePreflight: (uuid) => ({
    "preflight-uuid": uuid,
    "preflight-headers": "cors+pna",
    "expect-single-preflight": true,
  }),
};

// Methods generate behavior specifications for how `resources/preflight.py`
// should behave upon receiving a regular (non-preflight) request.
const ResponseBehavior = {
  // The response should succeed without CORS headers.
  default: () => ({}),

  // The response should succeed with CORS headers.
  allowCrossOrigin: () => ({ "final-headers": "cors" }),
};

const FetchTestResult = {
  SUCCESS: {
    ok: "true",
    body: "success",
    error: "",
  },
  OPAQUE: {
    ok: "false",
    body: "",
    type: "opaque",
    error: "",
  },
  FAILURE: {
    body: "",
    error: "TypeError: Failed to fetch",
  },
};

// Runs a fetch test. Tries to fetch a given subresource in a fenced frame.
//
// Main argument shape:
//
//   {
//     // Optional. Passed to `sourceResolveOptions()`.
//     source,
//
//     // Optional. Passed to `preflightUrl()`.
//     target,
//
//     // Optional. Passed to `fetch()`.
//     fetchOptions,
//
//     // Required. One of the values in `FetchTestResult`.
//     expected,
//   }
//
async function fencedFrameFetchTest(t, { source, target, fetchOptions, expected }) {
  const fetcher_url =
      resolveUrl("resources/fenced-frame-fetcher.https.html", sourceResolveOptions(source));

  const target_url = preflightUrl(target);

  fetcher_url.searchParams.set("mode", fetchOptions.mode);
  fetcher_url.searchParams.set("method", fetchOptions.method);
  fetcher_url.searchParams.set("url", target_url);

  const error_token = token();
  const ok_token = token();
  const body_token = token();
  const type_token = token();
  const source_url = generateURL(fetcher_url, [error_token, ok_token, body_token, type_token]);

  const fenced_frame = document.createElement('fencedframe');
  const config = new FencedFrameConfig(source_url);
  fenced_frame.config = config;
  document.body.append(fenced_frame);

  const error = await nextValueFromServer(error_token);
  const ok = await nextValueFromServer(ok_token);
  const body = await nextValueFromServer(body_token);
  const type = await nextValueFromServer(type_token);

  assert_equals(error, expected.error, "error");
  assert_equals(body, expected.body, "response body");
  if (expected.ok !== undefined) {
    assert_equals(ok, expected.ok, "response ok");
  }
  if (expected.type !== undefined) {
    assert_equals(type, expected.type, "response type");
  }
}

const FencedFrameTestResult = {
  SUCCESS: "loaded",
  FAILURE: "timeout",
};

async function fencedFrameTest(t, { source, target, expected }) {
  // Allows running tests in parallel.
  const target_url = preflightUrl(target);
  target_url.searchParams.set("file", "fenced-frame-local-network-access-target.https.html");

  const frame_loaded_key = token();
  const child_frame_target = generateURL(target_url, [frame_loaded_key]);

  const source_url =
      resolveUrl("resources/fenced-frame-local-network-access.https.html", sourceResolveOptions(source));
  source_url.searchParams.set("fenced_frame_url", child_frame_target);

  const fenced_frame = document.createElement('fencedframe');
  const config = new FencedFrameConfig(source_url);
  fenced_frame.config = config;
  document.body.append(fenced_frame);

  // The grandchild frame posts a message iff it loads successfully.
  // There exists no interoperable way to check whether a fenced frame failed to
  // load, so we use a timeout.
  // See: https://github.com/whatwg/html/issues/125
  const result = await Promise.race([
    nextValueFromServer(frame_loaded_key),
      new Promise((resolve) => {
        t.step_timeout(() => resolve("timeout"), 10000 /* ms */);
      }),
  ]);

  assert_equals(result, expected);
}