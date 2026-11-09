import { Icon } from "@iconify/react";
type Item = { label: string; value: number; icon: string; tone?: "info" | "success" | "warning" | "danger" };
export function VisualSummary({ items }: { items: Item[] }) {
 return <dl className="ve-visual-summary" aria-label="Resumo do recorte">{items.map(item => <div key={item.label} className={"ve-summary-" + (item.tone ?? "info")}><Icon icon={item.icon} width={20} aria-hidden="true" /><dt>{item.label}</dt><dd>{item.value.toLocaleString("pt-BR")}</dd></div>)}</dl>;
}
