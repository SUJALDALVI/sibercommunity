import { supabase } from "@/lib/supabase/supabase";

export type CommunityChecklistItem = {
  id: string;
  checklist_id: string;
  item_text: string;
  created_by: string;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
};

export type CommunityChecklist = {
  id: string;
  community_id: string;
  title: string;
  created_by: string;
  created_at: string;
  items: CommunityChecklistItem[];
};

export async function fetchCommunityChecklists(communityId: string): Promise<CommunityChecklist[]> {
  const { data, error } = await supabase
    .from("community_checklists")
    .select(
      `
        id,
        community_id,
        title,
        created_by,
        created_at,
        community_checklist_items:community_checklist_items (
          id,
          checklist_id,
          item_text,
          created_by,
          completed,
          completed_by,
          completed_at,
          sort_order,
          created_at
        )
      `
    )
    .eq("community_id", communityId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((checklist) => ({
    id: checklist.id,
    community_id: checklist.community_id,
    title: checklist.title,
    created_by: checklist.created_by,
    created_at: checklist.created_at,
    items: (checklist.community_checklist_items ?? []) as CommunityChecklistItem[],
  }));
}

export async function fetchCommunityChecklistById(checklistId: string): Promise<CommunityChecklist | null> {
  const { data, error } = await supabase
    .from("community_checklists")
    .select(
      `
        id,
        community_id,
        title,
        created_by,
        created_at,
        community_checklist_items:community_checklist_items (
          id,
          checklist_id,
          item_text,
          created_by,
          completed,
          completed_by,
          completed_at,
          sort_order,
          created_at
        )
      `
    )
    .eq("id", checklistId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    community_id: data.community_id,
    title: data.title,
    created_by: data.created_by,
    created_at: data.created_at,
    items: (data.community_checklist_items ?? []) as CommunityChecklistItem[],
  };
}

export async function createCommunityChecklist(communityId: string, title: string, items: string[]) {
  const trimmedTitle = title.trim();
  const cleanedItems = items.map((item) => item.trim()).filter(Boolean);

  if (!trimmedTitle) throw new Error("Checklist title is required.");
  if (cleanedItems.length === 0) throw new Error("Add at least one checklist item.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in to create a checklist.");

  const { data: checklist, error: checklistError } = await supabase
    .from("community_checklists")
    .insert({
      community_id: communityId,
      title: trimmedTitle,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (checklistError) throw new Error(checklistError.message);

  const rows = cleanedItems.map((item_text, index) => ({
    checklist_id: checklist.id,
    item_text,
    created_by: user.id,
    sort_order: index,
  }));

  const { error: itemError } = await supabase.from("community_checklist_items").insert(rows);
  if (itemError) throw new Error(itemError.message);

  const { error: messageError } = await supabase.from("community_messages").insert({
    community_id: communityId,
    user_id: user.id,
    content: trimmedTitle,
    message_type: "checklist",
    checklist_id: checklist.id,
  });

  if (messageError) throw new Error(messageError.message);

  return checklist;
}

export async function toggleChecklistItem(itemId: string, completed: boolean) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in.");

  const { error } = await supabase
    .from("community_checklist_items")
    .update({
      completed,
      completed_by: completed ? user.id : null,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", itemId);

  if (error) throw new Error(error.message);
}

export async function deleteChecklistItem(itemId: string) {
  const { error } = await supabase.from("community_checklist_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
}

export function subscribeToChecklists(communityId: string, onChecklists: (checklists: CommunityChecklist[]) => void) {
  const channel = supabase
    .channel(`trekking_checklists_${communityId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "community_checklists", filter: `community_id=eq.${communityId}` },
      async () => {
        const checklists = await fetchCommunityChecklists(communityId);
        onChecklists(checklists);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "community_checklist_items", filter: `checklist_id=in.(select id from public.community_checklists where community_id='${communityId}')` },
      async () => {
        const checklists = await fetchCommunityChecklists(communityId);
        onChecklists(checklists);
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
