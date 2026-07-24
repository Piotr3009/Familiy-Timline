import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {createClient} from '@/lib/supabase/server';
import {getFamilyContext} from '@/lib/family';
import {personName, sortByBirth} from '@/lib/persons/relations';
import {Card} from '@/components/ui';
import {EventForm} from '@/components/events/EventForm';

export default async function NewEventPage() {
  const ctx = await getFamilyContext();
  if (ctx === 'no-user') redirect('/login');
  if (ctx === 'no-family') redirect('/onboarding');
  const t = await getTranslations('events');
  const supabase = await createClient();

  const {data: personsRaw} = await supabase
    .from('visible_persons')
    .select('*')
    .eq('family_id', ctx.family.id);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="font-heading text-2xl">{t('newTitle')}</h1>
      <Card>
        <EventForm
          persons={sortByBirth(personsRaw ?? []).map((person) => ({
            id: person.id,
            name: personName(person)
          }))}
          defaultParticipantId={ctx.person?.id}
        />
      </Card>
    </div>
  );
}
