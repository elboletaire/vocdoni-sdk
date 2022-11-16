import { CID } from 'multiformats';
import * as json from 'multiformats/codecs/json';
import { sha256 } from 'multiformats/hashes/sha2';

const cidHash = async (data: any) => {
  const bytes = json.encode(data);
  const hash = await sha256.digest(bytes);

  return CID.create(1, json.code, hash).toString();
};

export default cidHash;
