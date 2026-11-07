import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.*;

public class BankAccountTesting {

    private BankAccount account;

    @BeforeEach
    public void reset() {
        account = new BankAccount();
    }

    @Test
    public void testDeposit() {
        account.deposit(10);
        assertEquals(10, account.getBalance());
        account.deposit(0.5);
        assertEquals(10.5, account.getBalance());

        // invalid amounts
        assertThrows(IllegalArgumentException.class, () -> {
            account.deposit(Double.POSITIVE_INFINITY);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            account.deposit(Double.NaN);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            account.deposit(0);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            account.deposit(-1);
        });
        assertEquals(10.5, account.getBalance());
    }

    @Test
    public void testConstructor() {
        assertEquals(0, account.getBalance());
        assertEquals(50, new BankAccount(50).getBalance());
        assertEquals(0, new BankAccount(0).getBalance());

        assertThrows(IllegalArgumentException.class, () -> {
            new BankAccount(-1);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            new BankAccount(Double.NaN);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            new BankAccount(Double.POSITIVE_INFINITY);
        });
    }

    @Test
    public void testWithdraw() {
        BankAccount a = new BankAccount(50);
        a.withdraw(20);
        assertEquals(30, a.getBalance());
        a.withdraw(30);                       // exact balance is allowed
        assertEquals(0, a.getBalance());

        assertThrows(BankAccount.InsufficientFundsException.class, () -> {
            a.withdraw(1);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            a.withdraw(0);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            a.withdraw(Double.POSITIVE_INFINITY);   // invalid, not "too much"
        });
        assertEquals(0, a.getBalance());
    }

    @Test
    public void testTransfer() {
        BankAccount a = new BankAccount(100);
        BankAccount b = new BankAccount(25);
        a.transfer(b, 40);
        assertEquals(60, a.getBalance());
        assertEquals(65, b.getBalance());
        a.transfer(b, 60);                    // exact balance is allowed
        assertEquals(0, a.getBalance());
        assertEquals(125, b.getBalance());

        assertThrows(BankAccount.InsufficientFundsException.class, () -> {
            a.transfer(b, 1);
        });
        assertEquals(0, a.getBalance());
        assertEquals(125, b.getBalance());
    }

    @Test
    public void testTransferInvalid() {
        BankAccount a = new BankAccount(30);
        BankAccount rich = new BankAccount(1000);

        assertThrows(IllegalArgumentException.class, () -> {
            a.transfer(null, 10);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            a.transfer(null, 1000);           // null is checked first
        });
        assertThrows(IllegalArgumentException.class, () -> {
            a.transfer(rich, 0);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            a.transfer(rich, Double.POSITIVE_INFINITY);
        });
        assertThrows(BankAccount.InsufficientFundsException.class, () -> {
            a.transfer(rich, 50);             // a's balance matters, not rich's
        });

        // transfer to self: no change, but still validated
        a.transfer(a, 10);
        assertThrows(IllegalArgumentException.class, () -> {
            a.transfer(a, -5);
        });
        assertThrows(BankAccount.InsufficientFundsException.class, () -> {
            a.transfer(a, 31);
        });

        assertEquals(30, a.getBalance());
        assertEquals(1000, rich.getBalance());
    }

    @Test
    public void testApplyInterest() {
        BankAccount a = new BankAccount(200);
        a.applyInterest(5);
        assertEquals(210, a.getBalance());
        a.applyInterest(0);                   // rate 0 is allowed
        assertEquals(210, a.getBalance());

        assertThrows(IllegalArgumentException.class, () -> {
            a.applyInterest(-1);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            a.applyInterest(Double.NaN);
        });
        assertThrows(IllegalArgumentException.class, () -> {
            a.applyInterest(Double.POSITIVE_INFINITY);
        });
        assertEquals(210, a.getBalance());
    }
}
