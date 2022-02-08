const { bsv, buildContractClass, getPreimage, toHex, num2bin, SigHashPreimage, sha256, Bytes } = require('scryptlib');
const { DataLen, loadDesc, deployContract, sendTx, createInputFromPrevTx, showError  } = require('../helper');

(async() => {
    try {
        const StateUid = buildContractClass(loadDesc('stateuid_release_desc.json'))
        const counter = new StateUid(9, new Bytes('01'))

        let amount = 8000
        // lock fund to the script
        const lockingTx =  await deployContract(counter, amount)
        console.log('funding txid:      ', lockingTx.id);

        let prevTx = lockingTx;

        let hashPrevouts = false;

        // unlock
        for (i = 0; i < 3; i++) {
            
            const unlockingTx = new bsv.Transaction();

            unlockingTx.addInput(createInputFromPrevTx(prevTx))
            .setOutput(0, (tx) => {
                // console.log('prevout')
                // console.log(tx.prevouts())
                if (!hashPrevouts){
                    hashPrevouts = sha256(sha256(tx.prevouts()))
                }
                const newLockingScript = counter.getNewStateScript({
                    counter: i + 1,
                    uid: new Bytes(hashPrevouts)
                })
                const newAmount =  amount - tx.getEstimateFee();
                return new bsv.Transaction.Output({
                    script: newLockingScript,
                    satoshis: newAmount,
                  })
            })
            .setInputScript(0, (tx, output) => {
                const preimage = getPreimage(tx, output.script, output.satoshis)
                // console.log('preimage')
                // console.log(preimage.toString())
                const newAmount =  amount - tx.getEstimateFee();
                return counter.unlock(new SigHashPreimage(toHex(preimage)), newAmount, new Bytes(hashPrevouts)).toScript()
            })
            .seal()
            

            await sendTx(unlockingTx)
            console.log('iteration #' + i + ' txid: ', unlockingTx.id)

            amount = unlockingTx.outputs[0].satoshis
            // update state
            counter.counter = i + 1;
            prevTx = unlockingTx;
        }

        console.log('Succeeded on testnet')
    } catch (error) {
        console.log('Failed on testnet')
        showError(error)
    }
})()
