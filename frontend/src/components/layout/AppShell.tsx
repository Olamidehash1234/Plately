import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Icon } from "@/components/Icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** Initials for the avatar fallback, e.g. "Ada Lovelace" -> "AL". */
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

const NAV = [
  { to: "/home", label: "Home", icon: "home" },
  { to: "/history", label: "History", icon: "history" },
  { to: "/classify", label: "Capture", icon: "photo_camera" },
  { to: "/profile", label: "Profile", icon: "person" },
];

/** Desktop sticky top navigation bar. */
function TopAppBar({ userName }: { userName: string }) {
  return (
    <header className="hidden md:block sticky top-0 z-50 bg-background border-b border-outline-variant w-full">
      <div className="max-w-[1440px] mx-auto flex justify-between items-center px-container-padding-desktop py-stack-md">
        <div className="flex items-center gap-12">
          <NavLink
            to="/home"
            className="font-headline-lg text-headline-lg text-primary tracking-tight"
          >
            Plately
          </NavLink>
          <nav className="flex gap-8">
            {NAV.slice(0, 4).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "font-label-md text-label-md transition-all duration-200 hover:opacity-80",
                    isActive
                      ? "text-primary font-bold"
                      : "text-on-surface-variant",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-6">
          <NavLink to="/profile" aria-label="Your profile">
            <Avatar>
              <AvatarFallback>{initials(userName)}</AvatarFallback>
            </Avatar>
          </NavLink>
        </div>
      </div>
    </header>
  );
}

/** Mobile sticky top bar: branding and an account menu. */
function MobileAppBar({
  userName,
  onLogout,
}: {
  userName: string;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  // Close the menu whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Lock page scroll behind the open menu.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  return (
    <>
      <header className="md:hidden sticky top-0 z-50 bg-background border-b border-outline-variant w-full">
        <div className="flex justify-between items-center gap-4 h-16 px-container-padding-mobile">
          <NavLink
            to="/home"
            className="font-headline-lg text-headline-lg leading-none text-primary tracking-tight"
          >
            Plately
          </NavLink>
          <div className="flex items-center gap-1 -mr-2">
            <button
              className="h-10 w-10 inline-flex items-center justify-center text-primary"
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="absolute top-full left-0 w-full border-t border-outline-variant bg-background px-container-padding-mobile py-stack-md flex flex-col gap-stack-md shadow-editorial">
            <Link
              to="/profile"
              className="flex items-center gap-4 pb-stack-md border-b border-outline-variant"
            >
              <Avatar>
                <AvatarFallback>{initials(userName)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-label-md text-label-md text-on-background">
                  {userName}
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  View profile
                </span>
              </div>
            </Link>

            <nav className="flex flex-col">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-4 py-3 rounded-xl transition-colors",
                      isActive
                        ? "text-primary font-bold"
                        : "text-on-surface-variant",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon name={item.icon} filled={isActive} />
                      <span className="font-label-md text-label-md">
                        {item.label}
                      </span>
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-4 py-3 text-on-surface-variant border-t border-outline-variant text-left"
            >
              <Icon name="logout" />
              <span className="font-label-md text-label-md">Log out</span>
            </button>
          </div>
        )}
      </header>

      {/* Dimmed, blurred backdrop behind the open menu */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-on-background/40 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}

/** Mobile fixed bottom navigation bar. */
function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-4 pt-2 bg-surface border-t border-outline-variant z-50">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              "flex flex-col items-center justify-center px-4 py-2 rounded-xl transition-all duration-200",
              isActive
                ? "text-primary font-bold scale-90"
                : "text-on-surface-variant hover:bg-surface-container-low",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={item.icon} filled={isActive} />
              <span className="font-label-sm text-label-sm">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  /** Extra classes for the <main> wrapper */
  mainClassName?: string;
}

/** Authenticated app layout: desktop top bar + mobile bottom nav. */
export function AppShell({ children, mainClassName }: AppShellProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const userName = user?.name ?? "";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopAppBar userName={userName} />
      <MobileAppBar userName={userName} onLogout={handleLogout} />
      <main className={cn("flex-grow", mainClassName)}>{children}</main>
      <BottomNav />
    </div>
  );
}
