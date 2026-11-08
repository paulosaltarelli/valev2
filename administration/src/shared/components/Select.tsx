import ReactSelect, {
  type GroupBase,
  type Props as ReactSelectProps,
  type StylesConfig,
} from "react-select";

const createDefaultStyles = <
  Option,
  IsMulti extends boolean,
  Group extends GroupBase<Option>,
>(): StylesConfig<Option, IsMulti, Group> => ({
  control: (base, state) => ({
    ...base,
    backgroundColor: "var(--op-surface)",
    borderColor: state.isFocused ? "var(--op-blue)" : "var(--op-line)",
    boxShadow: state.isFocused ? "0 0 0 0.2rem var(--op-blue-soft)" : "none",
    ":hover": {
      borderColor: "var(--op-blue)",
    },
    color: "var(--op-text)",
    minHeight: "var(--ve-control-height)",
    borderRadius: "var(--ve-control-radius)",
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "var(--op-surface)",
    border: "1px solid var(--op-line)",
    zIndex: 9999,
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "var(--op-blue-soft)"
      : state.isFocused
        ? "var(--op-blue-soft)"
        : "transparent",
    color: "var(--op-text)",
    ":active": {
      backgroundColor: "var(--op-blue-soft)",
    },
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--op-text)",
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--op-muted)",
  }),
  input: (base) => ({
    ...base,
    color: "var(--op-text)",
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: "var(--op-blue-soft)",
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "var(--op-text)",
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: "var(--op-muted)",
    ":hover": {
      backgroundColor: "var(--danger-100)",
      color: "var(--danger-main)",
    },
  }),
  indicatorSeparator: (base) => ({
    ...base,
    backgroundColor: "var(--op-line)",
  }),
  dropdownIndicator: (base) => ({
    ...base,
    color: "var(--op-muted)",
    ":hover": {
      color: "var(--op-text)",
    },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "var(--op-muted)",
    ":hover": {
      color: "var(--op-text)",
    },
  }),
});

export type SelectProps<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
> = ReactSelectProps<Option, IsMulti, Group>;

export default function Select<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>,
>(props: SelectProps<Option, IsMulti, Group>) {
  const portalTarget =
    typeof document !== "undefined" ? document.body : undefined;

  const baseStyles = createDefaultStyles<Option, IsMulti, Group>();
  const styles = props.styles ? { ...baseStyles, ...props.styles } : baseStyles;

  return (
    <ReactSelect<Option, IsMulti, Group>
      classNamePrefix="ve-select"
      menuPortalTarget={props.menuPortalTarget ?? portalTarget}
      styles={styles}
      {...props}
    />
  );
}

export type { MultiValue, SingleValue } from "react-select";
