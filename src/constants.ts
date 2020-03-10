import { Constants as IConstants } from '@hoprnet/hopr-core-connector-interface'

export default class implements IConstants {
  HASH_LENGTH = 32
  SIGNATURE_LENGTH = 160

  NETWORK = `testnet`
}
