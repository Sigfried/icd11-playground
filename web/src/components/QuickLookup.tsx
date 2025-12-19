import { useState, FormEvent } from "react";

interface QuickLookupProps {
  onLookup: (type: "foundation" | "mms" | "code", value: string) => void;
}

export function QuickLookup({ onLookup }: QuickLookupProps) {
  const [type, setType] = useState<"foundation" | "mms" | "code">("code");
  const [value, setValue] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onLookup(type, value.trim());
    }
  };

  const placeholders = {
    foundation: "e.g., 257068234 (Cholera)",
    mms: "e.g., 257068234",
    code: "e.g., 1A00 (Cholera)",
  };

  return (
    <form className="quick-lookup" onSubmit={handleSubmit}>
      <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
        <option value="code">Code</option>
        <option value="foundation">Foundation ID</option>
        <option value="mms">MMS ID</option>
      </select>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholders[type]}
      />
      <button type="submit">Lookup</button>
    </form>
  );
}
