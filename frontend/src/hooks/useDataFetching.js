import { useState, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

export function useDataFetching(user) {
  const [documents, setDocuments] = useState({ shared: [], uploaded: [] });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cache control
  const lastFetchRef = useRef(null);
  const CACHE_TIMEOUT = 30000; // 30 seconds

  const fetchData = useCallback(
    async (force = false) => {
      // Check cache validity
      if (
        !force &&
        lastFetchRef.current &&
        Date.now() - lastFetchRef.current < CACHE_TIMEOUT
      ) {
        return;
      }

      if (!user?.user_id) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch documents and users in parallel
        const [sharedDocsResponse, uploadedDocsResponse, usersResponse] =
          await Promise.all([
            supabase
              .from("documents")
              .select(
                `
            *,
            shared_documents!inner(*),
            comments(*),
            users!documents_uploaded_by_fkey(username),
            uploaded_by_user:users!documents_uploaded_by_fkey(username)
          `,
              )
              .eq("shared_documents.shared_with_user_id", user.user_id)
              .limit(50),

            supabase
              .from("documents")
              .select(
                `
            *,
            shared_documents(
              *,
              users!shared_documents_shared_with_user_id_fkey(username)
            ),
            comments(*),
            users!documents_uploaded_by_fkey(username)
          `,
              )
              .eq("uploaded_by", user.user_id)
              .limit(50),

            supabase
              .from("users")
              .select("*")
              .neq("user_id", user.user_id)
              .limit(50),
          ]);

        setDocuments({
          shared: sharedDocsResponse.data || [],
          uploaded: uploadedDocsResponse.data || [],
        });
        setUsers(usersResponse.data || []);

        // Update last fetch timestamp
        lastFetchRef.current = Date.now();

        // Cache the results
        localStorage.setItem(
          "dashboard_cache",
          JSON.stringify({
            documents: {
              shared: sharedDocsResponse.data || [],
              uploaded: uploadedDocsResponse.data || [],
            },
            users: usersResponse.data || [],
            timestamp: Date.now(),
          }),
        );
      } catch (error) {
        console.error("Error fetching data:", error);
        setError("Failed to fetch data. Please try again later.");

        // Try to load from cache if available
        const cached = localStorage.getItem("dashboard_cache");
        if (cached) {
          const { documents: cachedDocs, users: cachedUsers } =
            JSON.parse(cached);
          setDocuments(cachedDocs);
          setUsers(cachedUsers);
        }
      } finally {
        setLoading(false);
      }
    },
    [user?.user_id],
  );

  return { documents, users, loading, error, fetchData };
}
