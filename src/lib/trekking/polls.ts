import { supabase } from "@/lib/supabase/supabase";

export type CommunityPollOption = {
  id: string;
  poll_id: string;
  option_text: string;
  created_at: string;
};

export type CommunityPollVote = {
  id: string;
  poll_id: string;
  option_id: string;
  user_id: string;
  created_at: string;
};

export type CommunityPoll = {
  id: string;
  community_id: string;
  question: string;
  created_by: string;
  created_at: string;
  closed_at: string | null;
  options: CommunityPollOption[];
  votes: CommunityPollVote[];
};

export async function fetchCommunityPolls(communityId: string): Promise<CommunityPoll[]> {
  const { data, error } = await supabase
    .from("community_polls")
    .select(
      `
        id,
        community_id,
        question,
        created_by,
        created_at,
        closed_at,
        community_poll_options:community_poll_options ( id, poll_id, option_text, created_at ),
        community_poll_votes:community_poll_votes ( id, poll_id, option_id, user_id, created_at )
      `
    )
    .eq("community_id", communityId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((poll) => ({
    id: poll.id,
    community_id: poll.community_id,
    question: poll.question,
    created_by: poll.created_by,
    created_at: poll.created_at,
    closed_at: poll.closed_at,
    options: (poll.community_poll_options ?? []) as CommunityPollOption[],
    votes: (poll.community_poll_votes ?? []) as CommunityPollVote[],
  }));
}

export async function fetchCommunityPollById(pollId: string): Promise<CommunityPoll | null> {
  const { data, error } = await supabase
    .from("community_polls")
    .select(
      `
        id,
        community_id,
        question,
        created_by,
        created_at,
        closed_at,
        community_poll_options:community_poll_options ( id, poll_id, option_text, created_at ),
        community_poll_votes:community_poll_votes ( id, poll_id, option_id, user_id, created_at )
      `
    )
    .eq("id", pollId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    id: data.id,
    community_id: data.community_id,
    question: data.question,
    created_by: data.created_by,
    created_at: data.created_at,
    closed_at: data.closed_at,
    options: (data.community_poll_options ?? []) as CommunityPollOption[],
    votes: (data.community_poll_votes ?? []) as CommunityPollVote[],
  };
}

export async function createCommunityPoll(communityId: string, question: string, options: string[]) {
  const trimmedQuestion = question.trim();
  const cleanedOptions = options.map((item) => item.trim()).filter(Boolean);

  if (!trimmedQuestion) throw new Error("Poll question is required.");
  if (cleanedOptions.length < 2) throw new Error("Add at least two options.");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in to create a poll.");

  const { data: poll, error: pollError } = await supabase
    .from("community_polls")
    .insert({
      community_id: communityId,
      question: trimmedQuestion,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (pollError) throw new Error(pollError.message);

  const rows = cleanedOptions.map((option_text) => ({
    poll_id: poll.id,
    option_text,
  }));

  const { error: optionError } = await supabase.from("community_poll_options").insert(rows);
  if (optionError) throw new Error(optionError.message);

  const { error: messageError } = await supabase.from("community_messages").insert({
    community_id: communityId,
    user_id: user.id,
    content: trimmedQuestion,
    message_type: "poll",
    poll_id: poll.id,
  });

  if (messageError) throw new Error(messageError.message);

  return poll;
}

export async function voteOnPoll(pollId: string, optionId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be logged in to vote.");

  const { error } = await supabase.from("community_poll_votes").insert({
    poll_id: pollId,
    option_id: optionId,
    user_id: user.id,
  });

  if (error) throw new Error(error.message);
}

export async function closeCommunityPoll(pollId: string) {
  const { error } = await supabase.from("community_polls").update({ closed_at: new Date().toISOString() }).eq("id", pollId);
  if (error) throw new Error(error.message);
}

export function subscribeToPolls(communityId: string, onPolls: (polls: CommunityPoll[]) => void) {
  const channel = supabase
    .channel(`trekking_polls_${communityId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "community_polls", filter: `community_id=eq.${communityId}` },
      async () => {
        const polls = await fetchCommunityPolls(communityId);
        onPolls(polls);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "community_poll_options", filter: `poll_id=in.(select id from public.community_polls where community_id='${communityId}')` },
      async () => {
        const polls = await fetchCommunityPolls(communityId);
        onPolls(polls);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "community_poll_votes", filter: `poll_id=in.(select id from public.community_polls where community_id='${communityId}')` },
      async () => {
        const polls = await fetchCommunityPolls(communityId);
        onPolls(polls);
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
