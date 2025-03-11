import * as anchor from '@coral-xyz/anchor'
import { BN, Program } from '@coral-xyz/anchor'
import { Voting } from "@/../voting/target/types/voting"
import IDL from "@/../voting/target/idl/voting.json"
import { ActionGetResponse, ActionPostRequest, ActionPostResponse, ACTIONS_CORS_HEADERS, createPostResponse } from "@solana/actions"
import { clusterApiUrl, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { simulateTransaction } from '@coral-xyz/anchor/dist/cjs/utils/rpc'

// Solana Actions
export async function GET(request: Request) {
  const votingImageUrl = new URL('/voting.jpeg', request.url).toString();
  const actionMetadata: ActionGetResponse = {
    title: '2024 USA Election for President',
    icon: votingImageUrl,
    description: 'Vote for Trump or Biden in the 2024 USA elections',
    label: 'Vote',
    links: {
      actions: [
        {
          type: "post",
          label: "Vote Trump",
          href: "/api/vote?candidate=Trump"
        },
        {
          type: "post",
          label: "Vote Biden",
          href: "/api/vote?candidate=Biden"
        }
      ]
    }

  }
  return Response.json(actionMetadata, { headers: ACTIONS_CORS_HEADERS })
}

export const OPTIONS = GET;

export async function POST(request: Request) {

  const candidate = new URL(request.url).searchParams.get('candidate');

  if (!candidate || (candidate !== 'Trump' && candidate !== 'Biden')) {
    return new Response('Invalid Candiate', { status: 400 });
  }

  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const votingProgram: Program<Voting> = new Program<Voting>(IDL as Voting, {
    connection
  })
  const body: ActionPostRequest = await request.json();
  const voter = new PublicKey(body.account)

  try {
    const trump = "Trump";
    const biden = "Biden";

    const pollId = new BN(1);
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("poll"), pollId.toBuffer("le", 8)], // Use pollId as a seed
      votingProgram.programId
    );

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
        voter.toBuffer()
      ],
      votingProgram.programId
    );

    const candidatePda = candidate === 'Trump' ? trumpPda : bidenPda;
    const voteIx = await votingProgram.methods.vote(pollId, candidate)
      .accounts({
        // @ts-ignore
        poll: poolPda,
        candidate: candidatePda,
        voterRecord: voterPda,
        voter
      }).instruction()

    const blockhash = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: voter,
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight
    }).add(voteIx);

    const simRes = await simulateTransaction(connection, transaction);

    console.log(simRes);

    const response = await createPostResponse({
      fields: {
        type: 'transaction',
        transaction: transaction
      }
    })

    return Response.json(response, { headers: ACTIONS_CORS_HEADERS });

  } catch (error) {
    console.log(error)
    return new Response('Invalid account', { status: 500, headers: ACTIONS_CORS_HEADERS });
  }

  return Response.json({ candidate })

}
