import { Redirect, usePathname } from 'expo-router';

export default function NotFoundScreen() {
  const pathname = usePathname();
  
  // Handle simplified deep links from the web that omit the (auth) group
  if (pathname === '/login') {
    return <Redirect href="/(auth)/login" />;
  }
  if (pathname === '/signup') {
    return <Redirect href="/(auth)/signup" />;
  }
  if (pathname === '/welcome') {
    return <Redirect href="/(auth)/welcome" />;
  }
  
  // Default fallback
  return <Redirect href="/" />;
}
