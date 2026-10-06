import { usePreferences } from "../state/preferences";
import { useStore } from "../state/store";
import type { ReactNode } from "react";
import { DataInsightAction } from "./DataInsightAction";
export function Register({
  index,
  title,
  subtitle,
  actions,
  children,
  dateIndependent = false,
}: {
  index: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  dateIndependent?: boolean;
}) {
  const page = useStore((s) => s.tab);
  const config = usePreferences((s) => s.preferences.page[page]);
  const heading = config?.sectionTitles?.[index] || title;
  return (
    <section className="register" data-index={index}>
      <div className="register-head">
        <div className="register-title">
          <span className="index">{index}</span>
          <h2>{heading}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="register-actions">
          {actions}
          <DataInsightAction
            compact
            subject={`${heading}`}
            detail={subtitle}
            buttonLabel="Summarise"
            dateIndependent={dateIndependent}
          />
        </div>
      </div>
      {children}
    </section>
  );
}
