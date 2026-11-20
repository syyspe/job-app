import { academicWork } from './academicWork.ts'
import { duunitori } from './duunitori.ts'
import { nordea } from './nordea.ts'
import type { SourceConnector } from './types.ts'
import { valtiolle } from './valtiolle.ts'

// Every source the runner knows, by its config id.
export const CONNECTORS: SourceConnector[] = [academicWork, valtiolle, nordea, duunitori]
