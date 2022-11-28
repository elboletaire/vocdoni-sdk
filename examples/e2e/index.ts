import { computePublicKey } from '@ethersproject/signing-key';
import { Wallet } from '@ethersproject/wallet';
import { Election, PlainCensus, VocdoniSDKClient, Vote } from 'vocdoni-sdk';
import { delay } from '../../src/util/common';

const createElection = (census, electionType?) => {
  const election = new Election({
    title: 'Election title',
    description: 'Election description',
    header: 'https://source.unsplash.com/random',
    streamUri: 'https://source.unsplash.com/random',
    endDate: new Date().getTime() + 10000000,
    census,
    electionType: electionType ?? null,
  });

  election.addQuestion('This is a title', 'This is a description', [
    {
      title: 'Option 1',
      value: 0,
    },
    {
      title: 'Option 2',
      value: 1,
    },
  ]);

  return election;
};

async function main() {
  const creator = Wallet.createRandom();
  const client = new VocdoniSDKClient("https://api-dev.vocdoni.net/v2", creator);
  const census = new PlainCensus();
  census.add(computePublicKey(Wallet.createRandom().publicKey, true));
  census.add(computePublicKey(Wallet.createRandom().publicKey, true));
  census.add(computePublicKey(Wallet.createRandom().publicKey, true));
  const voter = Wallet.createRandom();
  census.add(computePublicKey(voter.publicKey, true));

  const election = createElection(census);

  await client.createAccount();
  await client.collectFaucetTokens();

  await client
    .createElection(election)
    .then((electionId) => {
      expect(electionId).toMatch(/^[0-9a-fA-F]{64}$/);
      client.setElectionId(electionId);
      return delay(25000);
    })
    .then(() => {
      client.wallet = voter;
      const vote = new Vote([1]);
      return client.submitVote(vote);
    })
    .then((voteHash) => expect(voteHash).toMatch(/^[0-9a-fA-F]{64}$/));
};


main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });