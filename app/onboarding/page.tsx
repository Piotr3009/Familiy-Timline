import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {Button, Card, PersonAvatar} from '@/components/ui';
import {CreateFamilyForm, AddRelativeForm} from '@/components/onboarding/OnboardingForms';

export default async function OnboardingPage() {
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  const t = await getTranslations();

  if (ctx === 'no-family') {
    // A claimed-but-not-yet-approved user is waiting, not founding.
    const supabaseUser = await createClient();
    const {data: pendingClaim} = await supabaseUser
      .from('invitations')
      .select('id')
      .eq('claim_status', 'pending_approval')
      .limit(1)
      .maybeSingle();

    // While a claim is awaiting approval, show ONLY the waiting state.
    // Offering "create a family" here is a trap: creating one adds a
    // second membership, and getFamilyContext (which takes the earliest
    // membership) would then permanently hide the claimed family.
    if (pendingClaim) {
      return (
        <main className="mx-auto w-full max-w-md px-4 py-10">
          <h1 className="font-heading mb-6 text-center text-3xl text-amber">
            {t('onboarding.welcome')}
          </h1>
          <Card>
            <div className="space-y-3 text-center">
              <span aria-hidden className="text-4xl">
                ⏳
              </span>
              <p className="text-sm text-ink-muted">{t('onboarding.waitingForApproval')}</p>
            </div>
          </Card>
        </main>
      );
    }

    return (
      <main className="mx-auto w-full max-w-md px-4 py-10">
        <h1 className="font-heading mb-6 text-center text-3xl text-amber">
          {t('onboarding.welcome')}
        </h1>
        <CreateFamilyForm />
      </main>
    );
  }

  const supabase = await createClient();
  const {data: members} = await supabase
    .from('visible_persons')
    .select('id, first_name, last_name, is_deceased')
    .eq('family_id', ctx.family.id)
    .order('created_at', {ascending: true});

  const me = ctx.person;
  let partnerOptions: {id: string; name: string}[] = [];
  if (me) {
    const {data: partnerRels} = await supabase
      .from('relationships')
      .select('person_a_id, person_b_id, status')
      .eq('type', 'partner')
      .or(`person_a_id.eq.${me.id},person_b_id.eq.${me.id}`)
      .in('status', ['married', 'partners']);
    const partnerIds = (partnerRels ?? []).map((rel) =>
      rel.person_a_id === me.id ? rel.person_b_id : rel.person_a_id
    );
    partnerOptions = (members ?? [])
      .filter((person) => partnerIds.includes(person.id))
      .map((person) => ({id: person.id, name: `${person.first_name} ${person.last_name}`}));
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="font-heading mb-2 text-center text-3xl text-amber">
        {t('onboarding.step2Title')}
      </h1>
      <p className="mb-6 text-center text-sm text-ink-muted">
        {t('onboarding.step2Subtitle')}
      </p>
      <Card className="mb-4">
        <p className="mb-3 text-sm font-medium text-ink">
          {t('onboarding.membersSoFar', {count: members?.length ?? 0})}
        </p>
        <ul className="flex flex-wrap gap-2">
          {(members ?? []).map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-2 rounded-full border border-border bg-surface-sunken px-3 py-1 text-sm"
            >
              <PersonAvatar
                name={`${person.first_name} ${person.last_name}`}
                size="sm"
                deceased={person.is_deceased}
              />
              {person.first_name} {person.last_name}
            </li>
          ))}
        </ul>
      </Card>
      {me ? (
        <Card>
          <h2 className="font-heading mb-4 text-xl">{t('onboarding.addRelativesTitle')}</h2>
          <AddRelativeForm
            anchorId={me.id}
            anchorName={me.first_name}
            partnerOptions={partnerOptions}
          />
          <p className="mt-4 text-xs text-ink-faint">{t('onboarding.grandparentsHint')}</p>
        </Card>
      ) : null}
      <div className="mt-6 text-center">
        <Link href="/dashboard">
          <Button variant="secondary">{t('onboarding.finish')}</Button>
        </Link>
      </div>
    </main>
  );
}
