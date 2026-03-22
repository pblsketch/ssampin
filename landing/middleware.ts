import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Exclude login page to avoid redirect loop
  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  const adminAuth = request.cookies.get('admin_auth');
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (adminPassword && adminAuth?.value === adminPassword) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/admin/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/admin/:path*'],
};
