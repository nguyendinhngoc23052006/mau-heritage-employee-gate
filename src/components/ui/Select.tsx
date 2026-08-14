import { ChevronDown } from "lucide-react";
import { type JSX, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  value: T | undefined;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
  searchable?: boolean;
}

export function Select<T extends string = string>(
  props: SelectProps<T>,
): JSX.Element {
  const {
    value,
    onChange,
    options,
    placeholder,
    disabled = false,
    id,
    ariaLabel,
    className = "",
    searchable = false,
  } = props;

  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [panelPosition, setPanelPosition] = useState({
    top: 0,
    left: 0,
    width: 0,
  });

  const selectedLabel =
    options.find((opt) => opt.value === value)?.label ||
    placeholder ||
    "Select…";

  const filteredOptions = searchable
    ? options.filter((opt) =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : options;

  const handleOpen = () => {
    if (!disabled) {
      setOpen(true);
      setSearchTerm("");
      setHighlightedIndex(0);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setSearchTerm("");
  };

  const handleSelect = (optionValue: T) => {
    onChange(optionValue);
    handleClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleOpen();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        const selected = filteredOptions[highlightedIndex];
        if (selected && !selected.disabled) {
          handleSelect(selected.value);
        }
        break;
      case "Escape":
        e.preventDefault();
        handleClose();
        break;
      case "Tab":
        handleClose();
        break;
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.currentTarget.value);
    setHighlightedIndex(0);
  };

  useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPanelPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        handleClose();
      }
    };

    const handleWindowResize = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPanelPosition({
          top: rect.bottom,
          left: rect.left,
          width: rect.width,
        });
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("resize", handleWindowResize);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open, searchable]);

  const panel = open
    ? createPortal(
        <ul
          ref={panelRef}
          role="listbox"
          style={{
            position: "fixed",
            top: `${panelPosition.top}px`,
            left: `${panelPosition.left}px`,
            width: `${panelPosition.width}px`,
            zIndex: 50,
          }}
          className="max-h-60 overflow-y-auto rounded-md border border-slate-300 bg-white shadow-lg"
        >
          {searchable && (
            <li className="border-b border-slate-200 p-2">
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search…"
                value={searchTerm}
                onChange={handleSearchChange}
                className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </li>
          )}
          {filteredOptions.map((option, idx) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                if (!option.disabled) handleSelect(option.value);
              }}
              className={`cursor-pointer px-3 py-2 text-sm ${
                idx === highlightedIndex ? "bg-slate-100" : ""
              } ${
                option.disabled
                  ? "cursor-not-allowed text-slate-400"
                  : "text-slate-900 hover:bg-slate-50"
              } ${option.value === value ? "bg-slate-50 font-medium" : ""}`}
            >
              {option.label}
            </li>
          ))}
        </ul>,
        document.body,
      )
    : null;

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={ariaLabel}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`inline-flex w-full items-center justify-between rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm transition ${
          disabled
            ? "cursor-not-allowed bg-slate-50 text-slate-400"
            : "bg-white text-slate-900 hover:bg-slate-50 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
        }`}
      >
        <span>{selectedLabel}</span>
        <ChevronDown size={16} className="ml-2 flex-shrink-0" />
      </button>
      {panel}
    </div>
  );
}
