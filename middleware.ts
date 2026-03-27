import { NextRequest, NextResponse } from "next/server";

function unauthorizedResponse(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="TraderPals Admin"',
    },
  });
}

export function middleware(request: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !password) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) {
    return unauthorizedResponse();
  }

  try {
    const decoded = atob(authHeader.slice(6));
    const [providedUser, ...rest] = decoded.split(":");
    const providedPassword = rest.join(":");

    if (providedUser === user && providedPassword === password) {
      return NextResponse.next();
    }
  } catch {
    return unauthorizedResponse();
  }

  return unauthorizedResponse();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/config/:path*", "/api/watchlist/:path*"],
};
