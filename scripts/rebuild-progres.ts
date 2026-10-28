// Hitung ulang agregat progres semua alokasi (alat pemulihan bila agregat diduga tidak sinkron).
//   npm run progres:rebuild
import { recalculateSemua } from "../lib/progres-alokasi";
import { db } from "../lib/db";

recalculateSemua()
  .then((n) => console.log(`progres: ${n} alokasi dihitung ulang`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
