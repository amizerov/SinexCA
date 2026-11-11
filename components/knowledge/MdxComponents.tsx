import type { ComponentPropsWithoutRef, ReactNode } from "react";

function headingId(children: ReactNode) {
  return String(children)
    .toLocaleLowerCase("ru")
    .replace(/[^a-zа-яё0-9\s-]/gi, "")
    .trim()
    .replace(/\s+/g, "-");
}

export const mdxComponents = {
  h2: ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => <h2 id={headingId(children)} {...props}>{children}</h2>,
  h3: ({ children, ...props }: ComponentPropsWithoutRef<"h3">) => <h3 id={headingId(children)} {...props}>{children}</h3>,
  a: (props: ComponentPropsWithoutRef<"a">) => <a {...props} rel={props.href?.startsWith("http") ? "noopener noreferrer" : undefined} />,
  Callout: ({ children, type = "info" }: { children: ReactNode; type?: "info" | "warning" }) => <aside className={`kb-callout ${type}`}>{children}</aside>,
};
