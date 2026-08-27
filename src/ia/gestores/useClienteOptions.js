import { useEffect, useRef, useState } from "react";
import { getClientes } from "../../api/configService";

export function useClienteOptions(active) {
  const generationRef = useRef(0);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return undefined;
    const generation = ++generationRef.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const clientes = await getClientes({ palavra: search.trim() || undefined, limit: 20, page: 1 });
        if (generation === generationRef.current) setOptions(Array.isArray(clientes) ? clientes : []);
      } catch {
        if (generation === generationRef.current) setOptions([]);
      } finally {
        if (generation === generationRef.current) setLoading(false);
      }
    }, 250);
    return () => {
      generationRef.current += 1;
      clearTimeout(timer);
    };
  }, [active, search]);

  return { search, setSearch, options, loading };
}
