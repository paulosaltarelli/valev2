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
    backgroundColor: "var(--input-bg)",
    borderColor: state.isFocused ? "var(--brand)" : "var(--input-stroke)",
    boxShadow: state.isFocused ? "0 0 0 0.2rem var(--primary-light)" : "none",
    ":hover": {
      borderColor: "var(--brand)",
    },
    color: "var(--text-primary-light)",
    minHeight: 38,
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: "var(--white)",
    border: "1px solid var(--border-color)",
    zIndex: 9999,
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "var(--primary-50)"
      : state.isFocused
        ? "var(--primary-50)"
        : "transparent",
    color: "var(--text-primary-light)",
    ":active": {
      backgroundColor: "var(--primary-100)",
    },
  }),
  singleValue: (base) => ({
    ...base,
    color: "var(--text-primary-light)",
  }),
  placeholder: (base) => ({
    ...base,
    color: "var(--text-secondary-light)",
  }),
  input: (base) => ({
    ...base,
    color: "var(--text-primary-light)",
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: "var(--primary-50)",
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: "var(--text-primary-light)",
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: "var(--text-secondary-light)",
    ":hover": {
      backgroundColor: "var(--danger-100)",
      color: "var(--danger-main)",
    },
  }),
  indicatorSeparator: (base) => ({
    ...base,
    backgroundColor: "var(--border-color)",
  }),
  dropdownIndicator: (base) => ({
    ...base,
    color: "var(--text-secondary-light)",
    ":hover": {
      color: "var(--text-primary-light)",
    },
  }),
  clearIndicator: (base) => ({
    ...base,
    color: "var(--text-secondary-light)",
    ":hover": {
      color: "var(--text-primary-light)",
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
