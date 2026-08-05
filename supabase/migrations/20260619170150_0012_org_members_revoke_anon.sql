revoke execute on function public.org_is_admin() from anon;
revoke execute on function public.org_members() from anon;
revoke execute on function public.org_invite_by_email(text, text, text) from anon;
revoke execute on function public.org_member_update(uuid, text, text, jsonb, numeric, boolean) from anon;
revoke execute on function public.org_member_remove(uuid) from anon;