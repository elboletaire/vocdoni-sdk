import {
  CAbundle,
  Proof,
  ProofArbo,
  ProofArbo_KeyType,
  ProofArbo_Type,
  ProofCA,
  ProofCA_Type,
  Tx,
  VoteEnvelope,
} from '@vocdoni/proto/vochain';
import { getHex, strip0x } from '../util/common';
import { Buffer } from 'buffer';
import { Asymmetric } from '../util/encryption';
import { CensusType, PublishedElection, Vote } from '../types';
import { CspCensusProof, OffchainCensusProof } from '../client';
import { TransactionCore } from './transaction';

export type IProofArbo = { siblings: string; weight?: bigint };
export type IProofCA = {
  type: number;
  voterAddress: string;
  signature: string;
  weight?: bigint;
};
export type IProofEVM = {
  key: string;
  proof: string[];
  value: string;
  weight?: bigint;
};

export type ProcessKeys = {
  encryptionPubKeys: { index: number; key: string }[];
  encryptionPrivKeys?: { index: number; key: string }[];
  commitmentKeys?: { index: number; key: string }[];
  revealKeys?: { index: number; key: string }[];
};

export type VoteValues = Array<number | bigint>;
export type VotePackage = {
  nonce: string;
  votes: VoteValues;
};

export enum CensusProofType {
  PUBKEY = 'pubkey',
  ADDRESS = 'address',
}

export abstract class VoteCore extends TransactionCore {
  /**
   * Cannot be constructed.
   */
  private constructor() {
    super();
  }

  public static generateVoteTransaction(
    election: PublishedElection,
    censusProof: OffchainCensusProof | CspCensusProof,
    votePackage: Vote,
    processKeys?: ProcessKeys
  ): Uint8Array {
    const txData = this.prepareVoteData(election, censusProof, votePackage, processKeys);
    const vote = VoteEnvelope.fromPartial(txData);
    return Tx.encode({
      payload: { $case: 'vote', vote },
    }).finish();
  }

  private static prepareVoteData(
    election: PublishedElection,
    censusProof: OffchainCensusProof | CspCensusProof,
    vote: Vote,
    processKeys?: ProcessKeys
  ): object {
    // if (!params) throw new Error("Invalid parameters")
    // else if (!Array.isArray(params.votes)) throw new Error("Invalid votes array")
    // else if (typeof params.processId != "string" || !params.processId.match(/^(0x)?[0-9a-zA-Z]+$/)) throw new Error("Invalid processId")
    // else if (params.processKeys) {
    //   if (!Array.isArray(params.processKeys.encryptionPubKeys) || !params.processKeys.encryptionPubKeys.every(
    //       item => item && typeof item.idx == "number" && typeof item.key == "string" && item.key.match(/^(0x)?[0-9a-zA-Z]+$/))) {
    //     throw new Error("Some encryption public keys are not valid")
    //   }
    // }

    try {
      const proof = this.packageSignedProof(election.id, election.census.type, censusProof);
      // const nonce = hexStringToBuffer(Random.getHex());
      const nonce = Buffer.from(strip0x(getHex()), 'hex');
      const { votePackage, keyIndexes } = this.packageVoteContent(vote.votes, processKeys);

      return {
        proof,
        processId: new Uint8Array(Buffer.from(strip0x(election.id), 'hex')),
        nonce: new Uint8Array(nonce),
        votePackage: new Uint8Array(votePackage),
        encryptionKeyIndexes: keyIndexes || [],
        nullifier: new Uint8Array(),
      };
    } catch (error) {
      throw new Error('The poll vote envelope could not be generated');
    }
  }

  /** Packages the given parameters into a proof that can be submitted to the Vochain */
  private static packageSignedProof(
    electionId: string,
    type: CensusType,
    censusProof: OffchainCensusProof | CspCensusProof
  ): Proof {
    if (type == CensusType.WEIGHTED) {
      const proof = censusProof as OffchainCensusProof;
      // Check census proof
      if (typeof proof?.proof !== 'string' || !proof?.proof.match(/^(0x)?[0-9a-zA-Z]+$/)) {
        throw new Error('Invalid census proof (must be a hex string)');
      }

      let keyType;
      switch (proof.type) {
        case CensusProofType.ADDRESS:
          keyType = ProofArbo_KeyType.ADDRESS;
          break;
        case CensusProofType.PUBKEY:
          keyType = ProofArbo_KeyType.PUBKEY;
          break;
        default:
          keyType = ProofArbo_KeyType.UNRECOGNIZED;
          break;
      }

      const aProof = ProofArbo.fromPartial({
        siblings: Uint8Array.from(Buffer.from(proof.proof, 'hex')),
        type: ProofArbo_Type.BLAKE2B,
        value: new Uint8Array(Buffer.from(proof.value, 'hex')),
        keyType,
      });

      return Proof.fromPartial({
        payload: { $case: 'arbo', arbo: aProof },
      });
    } else if (type == CensusType.CSP) {
      const proof = censusProof as CspCensusProof;

      // Populate the proof
      const caProof = ProofCA.fromPartial({
        // type: proof.type,
        type: ProofCA_Type.ECDSA_BLIND_PIDSALTED,
        signature: new Uint8Array(Buffer.from(strip0x(proof.signature), 'hex')),
        bundle: this.cspCaBundle(electionId, proof.address),
        // weight
      });

      return Proof.fromPartial({
        payload: { $case: 'ca', ca: caProof },
      });
    }
    // else if (censusOrigin.isErc20 || censusOrigin.isErc721 || censusOrigin.isErc1155 || censusOrigin.isErc777) {
    //   // Check census proof
    //   const resolvedProof = resolveEvmProof(censusProof)
    //   if (!resolvedProof) throw new Error("The proof is not valid")
    //
    //   if (typeof resolvedProof == "string") throw new Error("Invalid census proof for an EVM process")
    //   else if (typeof resolvedProof.key != "string" ||
    //       !Array.isArray(resolvedProof.proof) || typeof resolvedProof.value != "string")
    //     throw new Error("Invalid census proof (must be an object)")
    //
    //   let hexValue = resolvedProof.value
    //   if (resolvedProof.value.length % 2 !== 0) {
    //     hexValue = resolvedProof.value.replace("0x", "0x0")
    //   }
    //
    //   const siblings = resolvedProof.proof.map(sibling => new Uint8Array(hexStringToBuffer(sibling)))
    //
    //   const esProof = ProofEthereumStorage.fromPartial({
    //     key: new Uint8Array(hexStringToBuffer(resolvedProof.key)),
    //     value: new Uint8Array(hexStringToBuffer(hexValue)),
    //     siblings: siblings
    //   })
    //
    //   proof.payload = { $case: "ethereumStorage", ethereumStorage: esProof }
    // }
    else {
      throw new Error('This process type is not supported yet');
    }
  }

  public static cspCaBundle(electionId: string, address: string) {
    return CAbundle.fromPartial({
      processId: new Uint8Array(Buffer.from(strip0x(electionId), 'hex')),
      address: new Uint8Array(Buffer.from(strip0x(address), 'hex')),
    });
  }

  public static encodeCspCaBundle(bundle: CAbundle) {
    return CAbundle.encode(bundle).finish();
  }

  private static packageVoteContent(votes: VoteValues, processKeys?: ProcessKeys) {
    // if (!Array.isArray(votes)) throw new Error('Invalid votes');
    // else if (votes.some(vote => typeof vote !== 'number'))
    //   throw new Error('Votes needs to be an array of numbers');
    // else if (processKeys) {
    //   if (
    //     !Array.isArray(processKeys.encryptionPubKeys) ||
    //     !processKeys.encryptionPubKeys.every(
    //       item =>
    //         item &&
    //         typeof item.idx === 'number' &&
    //         typeof item.key === 'string' &&
    //         item.key.match(/^(0x)?[0-9a-zA-Z]+$/)
    //     )
    //   ) {
    //     throw new Error('Some encryption public keys are not valid');
    //   }
    // }

    // produce a 8 byte nonce
    const nonce = getHex().substring(2, 18);

    const payload: VotePackage = {
      nonce,
      votes,
    };
    const strPayload = JSON.stringify(payload);

    if (processKeys && processKeys.encryptionPubKeys && processKeys.encryptionPubKeys.length) {
      // Sort key indexes
      processKeys.encryptionPubKeys.sort((a, b) => a.index - b.index);

      const publicKeys: string[] = [];
      const publicKeysIdx: number[] = [];
      // NOTE: Using all keys by now
      processKeys.encryptionPubKeys.forEach((entry) => {
        publicKeys.push(strip0x(entry.key));
        publicKeysIdx.push(entry.index);
      });

      let votePackage = Asymmetric.encryptRaw(Buffer.from(strPayload), publicKeys[0]);
      for (let i = 1; i < publicKeys.length; i++) {
        votePackage = Asymmetric.encryptRaw(votePackage, publicKeys[i]);
      }
      return { votePackage, keyIndexes: publicKeysIdx };
    } else {
      return { votePackage: Buffer.from(strPayload) };
    }
  }
}
