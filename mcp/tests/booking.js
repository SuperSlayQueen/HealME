// E2E-тест инструментов бронирования: list_psychologists → get_free_slots →
// book_slot (успех, конфликт, автоподбор, валидация) → list_bookings.
// Требуется запущенный сайт: python server.py в корне проекта (или HEALME_URL).
import { listPsychologists, getFreeSlots, bookSlot, listBookings, resetProfile, closeBrowser } from '../tools.js';

const url = process.env.HEALME_URL || 'http://127.0.0.1:5500/';
let fails = 0;
const check = (cond, name) => { console.log((cond ? 'PASS' : 'FAIL') + ' ' + name); if (!cond) fails++; };

resetProfile(); // чистый профиль — детерминированный сценарий

try {
  const ps = await listPsychologists(url);
  check(ps.ok && ps.count === 4, `list_psychologists: найдено ${ps.count} психологов`);

  const slots = await getFreeSlots({ psychologist: 'maria', url });
  check(slots.ok && slots.days.length > 0, `get_free_slots: у maria свободные дни — ${slots.days.map(d => d.day).join(', ')}`);

  const d0 = slots.days[0];

  // 1) бронь с явно указанным днём и временем
  const b1 = await bookSlot({ psychologist: 'maria', day: d0.day, time: d0.freeSlots[0], name: 'Мария Тестова', email: 'maria.test@example.com', url });
  check(b1.ok && b1.bookingId, `book_slot (день и время указаны): ${b1.message || b1.error}`);
  check(b1.booking && b1.booking.day === d0.day && b1.booking.time === d0.freeSlots[0] && b1.booking.status === 'ok',
    `book_slot вернул корректную запись из IndexedDB: ${JSON.stringify(b1.booking)}`);

  // 2) повторная бронь того же слота отклоняется
  const b2 = await bookSlot({ psychologist: 'maria', day: d0.day, time: d0.freeSlots[0], name: 'Другой Клиент', email: 'other@example.com', url });
  check(!b2.ok, `book_slot на занятый слот отклонён: ${b2.error}`);

  // 3) бронь с автоподбором дня и времени
  const b3 = await bookSlot({ psychologist: 'igor', name: 'Игорь Тестов', email: 'igor.test@example.com', url });
  check(b3.ok && b3.bookingId, `book_slot (автоподбор дня и времени): ${b3.message || b3.error}`);

  // 4) валидация данных
  const b4 = await bookSlot({ psychologist: 'maria', name: 'X', email: 'not-an-email', url });
  check(!b4.ok, `book_slot с некорректными данными отклонён: ${b4.error}`);

  // 5) несуществующий психолог
  const b5 = await bookSlot({ psychologist: 'nonexistent', name: 'Тест Тест', email: 't@example.com', url });
  check(!b5.ok, `book_slot несуществующему психологу отклонён: ${b5.error}`);

  // 6) list_bookings видит созданные брони
  const lb = await listBookings({ url });
  check(lb.bookings.some(b => b.id === b1.bookingId && b.status === 'предстоит'), 'list_bookings: первая бронь на месте');
  check(lb.bookings.some(b => b.id === b3.bookingId && b.status === 'предстоит'), 'list_bookings: вторая бронь на месте');

  console.log(fails ? '\nБРОНЬ-ТЕСТ: ЕСТЬ ОШИБКИ' : '\nБРОНЬ-ТЕСТ: OK');
} finally {
  await closeBrowser();
}
process.exit(fails ? 1 : 0);
