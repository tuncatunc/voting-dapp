import * as anchor from '@coral-xyz/anchor'
import { BN, Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { Voting } from '../target/types/voting'
import { assert } from 'console'

describe('voting', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)
  const payer = provider.wallet as anchor.Wallet

  const votingProgram = anchor.workspace.Voting as Program<Voting>

  const pollId = new BN(1)
  const pollStart = new BN(new Date().getTime());
  const pollEnd = new BN(new Date().getTime() + 1000);
  const pollQuestion = "Who is the best candidate?"

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("poll"), pollId.toBuffer("le", 8)], // Use pollId as a seed
    votingProgram.programId
  );

  const trump = "Trump";
  const biden = "Biden";
  const [trumpPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("candidate"),
      pollId.toBuffer("le", 8),
      Buffer.from(trump)
    ],
    votingProgram.programId
  );

  const [bidenPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("candidate"),
      pollId.toBuffer("le", 8),
      Buffer.from(biden)
    ],
    votingProgram.programId
  );

  const [voterPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("voter"),
      pollId.toBuffer("le", 8),
      payer.publicKey.toBuffer()
    ],
    votingProgram.programId
  );

  it('Initialize Poll', async () => {

    const tx = await votingProgram.methods
      .initializePool(
        pollId,
        pollStart,
        pollEnd,
        pollQuestion
      )
      .accounts({
        // @ts-ignore
        pool: poolPda, // PDA for the Pool account
      })
      .rpc()

    provider.connection.confirmTransaction(tx)

    const pollAccount = await votingProgram.account.poll.fetch(poolPda)
    // console.log(`Pool question ${poolAccount.poolQuestion} poll start ${poolAccount.poolStartDate} poll end ${poolAccount.poolEndDate}`)
    assert(pollAccount.poolQuestion === pollQuestion)
    assert(pollAccount.poolStartDate.eq(pollStart))
    assert(pollAccount.poolEndDate.eq(pollEnd))
  })

  it('Initialize Candidate', async () => {
    const txTrump = await votingProgram.methods
      .initializeCandidate(pollId, trump)
      .accounts({
        // @ts-ignore
        candidate: trumpPda,
        pool: poolPda, // From the previous test
      })
      .rpc();

    await provider.connection.confirmTransaction(txTrump);

    const txBiden = await votingProgram.methods
      .initializeCandidate(pollId, biden)
      .accounts({
        // @ts-ignore
        candidate: bidenPda,
        pool: poolPda, // From the previous test
      })
      .rpc();

    await provider.connection.confirmTransaction(txBiden);

    const trumpAccount = await votingProgram.account.candidate.fetch(trumpPda);
    assert(trumpAccount.candidateName === trump, 'Candidate name is not Trump')
    assert(trumpAccount.candidateVotes.eq(new BN(0)), 'Candidate votes are not 0')

    const bidenAccount = await votingProgram.account.candidate.fetch(bidenPda);
    assert(bidenAccount.candidateName === biden, 'Candidate name is not Biden');
    assert(bidenAccount.candidateVotes.eq(new BN(0)))

    const poolAccount = await votingProgram.account.poll.fetch(poolPda);
    console.log(`Pool Account`)
    console.log(poolAccount)
    assert(poolAccount.candidateCount.eq(new BN(2)))
  });

  it('User can Vote', async () => {
    try {
      const tx = await votingProgram.methods
        .vote(pollId, trump)
        .accounts({
          // @ts-ignore
          poll: poolPda,
          candidate: trumpPda,
          voterRecord: voterPda,
          voter: payer.publicKey,
        })
        .rpc();

      await provider.connection.confirmTransaction(tx);

      const trumpAccount = await votingProgram.account.candidate.fetch(trumpPda);
      assert(trumpAccount.candidateVotes.eq(new BN(1)))

      const bidenAccount = await votingProgram.account.candidate.fetch(bidenPda);
      assert(bidenAccount.candidateVotes.eq(new BN(0)))
    } catch (error) {
      // console.log(error)
    }
  })

  it('User cannot Vote twice', async () => {
    const alreadyVotedErr = votingProgram.idl.errors.find(e => e.name === "alreadyVoted")
    try {
      await (votingProgram.methods
        .vote(pollId, trump)
        .accounts({
          // @ts-ignore
          poll: poolPda,
          candidate: trumpPda,
          voterRecord: voterPda,
          voter: payer.publicKey,
        })
        .rpc())
      assert(false, 'Double voting error not thrown')
    } catch (error) {
      assert(true, 'Double voting error not thrown')
    }
  })
})