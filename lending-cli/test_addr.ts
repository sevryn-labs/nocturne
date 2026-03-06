import { MidnightBech32m, UnshieldedAddress } from '@midnight-ntwrk/wallet-sdk-address-format';
function run() {
    const raw = "mn_addr_preprod16t47na8kptxkf9tsqj6f39hcru6whylchn7z96vr6zll0vcd8aaskgmm5n";
    const bech32Address = MidnightBech32m.parse(raw);
    const decoded = UnshieldedAddress.codec.decode('preprod', bech32Address);
    console.log(decoded.hexString);
    console.log(decoded.data.toString('hex'));
}
run();
